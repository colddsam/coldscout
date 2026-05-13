"""
Admin API for the Dynamic API Key Orchestrator.

All endpoints are gated by the existing private-router X-API-Key check plus
``get_current_active_superuser`` so only platform administrators can view or
mutate the credential pool. Secrets never round-trip back to the browser —
responses include only a masked preview (``api_key_preview``).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_superuser
from app.core.database import get_db
from app.core.key_encryption import encrypt_api_key, mask_api_key, decrypt_api_key, InvalidToken
from app.models.infrastructure import APIProvider
from app.models.user import User
from app.modules.infrastructure.key_manager import (
    PROVIDER_USE_CASES,
    VALID_PROVIDERS,
    VALID_USE_CASES,
    apply_weight_rebalance,
    preview_weight_collision,
    provider_status,
    use_cases_for_provider,
)
from app.schemas.infrastructure import (
    APIProviderCreate,
    APIProviderResponse,
    APIProviderStatsResponse,
    APIProviderStatsRow,
    APIProviderUpdate,
    APIProviderWriteResponse,
    ProviderUseCaseMapResponse,
    WeightCollisionRow,
    WeightPreviewRequest,
    WeightPreviewResponse,
)


router = APIRouter(prefix="/api-keys", tags=["api-keys"])


def _to_response(row: APIProvider) -> APIProviderResponse:
    """Decrypt the stored ciphertext just enough to render a masked preview.

    Decryption is cheap and contained — the plaintext is discarded after the
    mask is computed. Failures (e.g. APP_SECRET_KEY rotated since the key
    was stored) surface as ``********`` so the admin UI still renders.
    """
    try:
        plain = decrypt_api_key(row.encrypted_api_key)
        preview = mask_api_key(plain)
    except (InvalidToken, ValueError):
        preview = "********"
    return APIProviderResponse(
        id=row.id,
        provider_name=row.provider_name,
        use_case=row.use_case,
        label=row.label,
        api_key_preview=preview,
        is_active=row.is_active,
        weight=row.weight,
        usage_count=row.usage_count,
        rate_limit_hits=row.rate_limit_hits,
        total_failures=row.total_failures,
        last_used_at=row.last_used_at,
        last_failure_at=row.last_failure_at,
        last_failure_reason=row.last_failure_reason,
        cooldown_until=row.cooldown_until,
        status=provider_status(row),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "",
    response_model=list[APIProviderResponse],
    summary="List every API credential in the orchestrator pool",
)
async def list_api_keys(
    provider_name: Optional[str] = None,
    use_case: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_active_superuser),
) -> list[APIProviderResponse]:
    stmt = select(APIProvider).order_by(
        APIProvider.provider_name.asc(),
        APIProvider.use_case.asc(),
        APIProvider.created_at.asc(),
    )
    if provider_name:
        if provider_name not in VALID_PROVIDERS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown provider_name")
        stmt = stmt.where(APIProvider.provider_name == provider_name)
    if use_case:
        if use_case not in VALID_USE_CASES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown use_case")
        stmt = stmt.where(APIProvider.use_case == use_case)
    if is_active is not None:
        stmt = stmt.where(APIProvider.is_active.is_(is_active))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_to_response(r) for r in rows]


def _to_collision_rows(collisions) -> list[WeightCollisionRow]:
    return [
        WeightCollisionRow(
            id=c.id,
            label=c.label,
            use_case=c.use_case,
            old_weight=c.old_weight,
            new_weight=c.new_weight,
        )
        for c in collisions
    ]


@router.post(
    "",
    response_model=APIProviderWriteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new API credential to the orchestrator pool",
)
async def create_api_key(
    body: APIProviderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> APIProviderWriteResponse:
    # Ripple-down rebalance: if another same-provider key already holds
    # ``body.weight``, push it (and any further conflicts) down by 1 so the
    # new key occupies the requested priority slot. We do this inside the
    # same transaction as the insert so a failure rolls everything back.
    collisions = await apply_weight_rebalance(
        db, body.provider_name, body.weight, exclude_id=None
    )

    row = APIProvider(
        provider_name=body.provider_name,
        use_case=body.use_case,
        label=body.label,
        weight=body.weight,
        encrypted_api_key=encrypt_api_key(body.api_key),
        is_active=True,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    logger.info(
        "api_keys: created provider_id={} provider={} use_case={} weight={} "
        "ripple_shifts={} by user={}",
        row.id, row.provider_name, row.use_case, row.weight,
        len(collisions), current_user.email,
    )
    return APIProviderWriteResponse(
        record=_to_response(row),
        weight_collisions=_to_collision_rows(collisions),
    )


@router.patch(
    "/{provider_id}",
    response_model=APIProviderWriteResponse,
    summary="Update an API credential row",
)
async def update_api_key(
    provider_id: UUID,
    body: APIProviderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> APIProviderWriteResponse:
    row = await db.get(APIProvider, provider_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API key not found")

    # Reject use_case values that aren't valid for this row's provider.
    # The provider can't be changed via PATCH (it's tied to the key itself),
    # so we only need to revalidate the use_case against PROVIDER_USE_CASES.
    if body.use_case is not None:
        allowed = use_cases_for_provider(row.provider_name)
        if body.use_case not in allowed:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"use_case '{body.use_case}' is not supported by provider "
                    f"'{row.provider_name}'. Allowed: {allowed}"
                ),
            )
        row.use_case = body.use_case

    if body.label is not None:
        row.label = body.label
    if body.is_active is not None:
        row.is_active = body.is_active
        # Re-enabling a key clears its cooldown so it can re-enter the rotation.
        if body.is_active:
            row.cooldown_until = None
    if body.api_key is not None:
        row.encrypted_api_key = encrypt_api_key(body.api_key)

    collisions = []
    if body.weight is not None and body.weight != row.weight:
        # Rebalance against every OTHER same-provider key before claiming
        # the new slot. We exclude this row so it doesn't ripple itself.
        collisions = await apply_weight_rebalance(
            db, row.provider_name, body.weight, exclude_id=row.id
        )
        row.weight = body.weight

    await db.commit()
    await db.refresh(row)
    logger.info(
        "api_keys: updated provider_id={} weight={} ripple_shifts={} by user={}",
        row.id, row.weight, len(collisions), current_user.email,
    )
    return APIProviderWriteResponse(
        record=_to_response(row),
        weight_collisions=_to_collision_rows(collisions),
    )


@router.post(
    "/preview-weight",
    response_model=WeightPreviewResponse,
    summary="Preview the ripple-down effect of assigning a weight",
)
async def preview_weight(
    body: WeightPreviewRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_active_superuser),
) -> WeightPreviewResponse:
    if body.provider_name not in VALID_PROVIDERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unknown provider_name")
    collisions = await preview_weight_collision(
        db, body.provider_name, body.weight, exclude_id=body.exclude_id
    )
    return WeightPreviewResponse(weight_collisions=_to_collision_rows(collisions))


@router.get(
    "/providers",
    response_model=ProviderUseCaseMapResponse,
    summary="Auto-mapping of providers to the use_cases they serve",
)
async def providers_map(
    _user: User = Depends(get_current_active_superuser),
) -> ProviderUseCaseMapResponse:
    return ProviderUseCaseMapResponse(
        providers={p: list(uc) for p, uc in PROVIDER_USE_CASES.items()},
        use_cases=sorted(VALID_USE_CASES),
    )


@router.post(
    "/{provider_id}/toggle",
    response_model=APIProviderResponse,
    summary="Activate / deactivate an API credential row",
)
async def toggle_api_key(
    provider_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> APIProviderResponse:
    row = await db.get(APIProvider, provider_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API key not found")
    row.is_active = not row.is_active
    if row.is_active:
        row.cooldown_until = None
    await db.commit()
    await db.refresh(row)
    logger.info(
        "api_keys: toggled provider_id={} -> is_active={} by user={}",
        row.id, row.is_active, current_user.email,
    )
    return _to_response(row)


@router.post(
    "/{provider_id}/reset-cooldown",
    response_model=APIProviderResponse,
    summary="Clear an active cooldown immediately",
)
async def reset_cooldown(
    provider_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
) -> APIProviderResponse:
    row = await db.get(APIProvider, provider_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API key not found")
    row.cooldown_until = None
    row.last_failure_reason = None
    await db.commit()
    await db.refresh(row)
    logger.info(
        "api_keys: reset cooldown for provider_id={} by user={}",
        row.id, current_user.email,
    )
    return _to_response(row)


@router.delete(
    "/{provider_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    summary="Permanently remove an API credential row",
)
async def delete_api_key(
    provider_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_superuser),
):
    row = await db.get(APIProvider, provider_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API key not found")
    await db.delete(row)
    await db.commit()
    logger.info(
        "api_keys: deleted provider_id={} by user={}",
        provider_id, current_user.email,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/stats",
    response_model=APIProviderStatsResponse,
    summary="Aggregated key-pool analytics",
)
async def api_key_stats(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_active_superuser),
) -> APIProviderStatsResponse:
    result = await db.execute(select(APIProvider))
    rows = result.scalars().all()

    now = datetime.now(timezone.utc)
    grouped: dict[tuple[str, str], dict] = defaultdict(
        lambda: {
            "active_keys": 0,
            "cooldown_keys": 0,
            "disabled_keys": 0,
            "total_usage": 0,
            "total_rate_limit_hits": 0,
            "total_failures": 0,
        }
    )
    totals = {
        "active_keys": 0,
        "cooldown_keys": 0,
        "disabled_keys": 0,
        "total_usage": 0,
        "total_rate_limit_hits": 0,
        "total_failures": 0,
    }
    for r in rows:
        key = (r.provider_name, r.use_case)
        bucket = grouped[key]
        if not r.is_active:
            bucket["disabled_keys"] += 1
            totals["disabled_keys"] += 1
        elif r.cooldown_until and r.cooldown_until > now:
            bucket["cooldown_keys"] += 1
            totals["cooldown_keys"] += 1
        else:
            bucket["active_keys"] += 1
            totals["active_keys"] += 1
        bucket["total_usage"] += r.usage_count or 0
        bucket["total_rate_limit_hits"] += r.rate_limit_hits or 0
        bucket["total_failures"] += r.total_failures or 0
        totals["total_usage"] += r.usage_count or 0
        totals["total_rate_limit_hits"] += r.rate_limit_hits or 0
        totals["total_failures"] += r.total_failures or 0

    stats_rows = [
        APIProviderStatsRow(
            provider_name=p,
            use_case=u,
            **agg,
        )
        for (p, u), agg in sorted(grouped.items())
    ]
    totals_row = APIProviderStatsRow(
        provider_name="ALL",
        use_case="ALL",
        **totals,
    )
    return APIProviderStatsResponse(
        rows=stats_rows,
        totals=totals_row,
        valid_providers=sorted(VALID_PROVIDERS),
        valid_use_cases=sorted(VALID_USE_CASES),
    )
