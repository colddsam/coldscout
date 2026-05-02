"""
Per-Freelancer Discovery Configuration API.

Lets each freelancer toggle between AI-driven "auto" target selection and
a hand-curated list of pinned (location, category, max_results) targets,
plus inspect and prune their own SearchHistory.

Strict per-user ownership
-------------------------
Every endpoint reads / mutates ONLY ``current_user``'s rows. Even
superusers cannot read or edit another freelancer's discovery config or
search history through this router — that's an explicit product
requirement ("admin also will have his own set of configuration"). If a
future admin tool needs cross-user visibility, it should live behind a
separate ``/admin/...`` route, not this one.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.core.database import get_db
from app.models.freelancer_discovery_config import FreelancerDiscoveryConfig
from app.models.lead import SearchHistory
from app.models.user import User


router = APIRouter(prefix="/discovery-config")
settings = get_settings()


# ── Constants ─────────────────────────────────────────────────────────────────
# Hard cap on how many pinned targets a single freelancer can configure.
# Independent of DISCOVERY_BATCH_LIMIT — protects the form UX (long lists
# get unwieldy) and the Google Places quota (each target is a paginated
# search call). Bump if real freelancers hit the cap.
MAX_TARGETS_PER_FREELANCER = 10

# Per-target floor for max_results. The slider must let the freelancer
# request at least one lead per target.
MIN_RESULTS_PER_TARGET = 1

ALLOWED_DEPTHS = ("sub_area", "city", "region", "country")

# Suggestion list returned by GET /categories. Free-form text is still
# accepted on write — these are just hints for the UI dropdown.
#
# IMPORTANT: these go straight into Google Places "searchText" as
# ``"{category} in {location}"``. Use natural-language phrases (with
# spaces), NOT Google Places type IDs (with underscores like
# ``clothing_store``). Type IDs are searched literally and either return
# zero results or cause a 400 — natural language matches what a real
# user would type into Google Maps.
SUGGESTED_CATEGORIES = [
    "dentist", "doctor", "physiotherapist", "chiropractor",
    "lawyer", "accountant", "real estate agent", "insurance agency",
    "plumber", "electrician", "HVAC contractor", "roofing contractor",
    "hair salon", "beauty salon", "spa", "gym",
    "restaurant", "cafe", "bakery", "bar",
    "car repair", "car dealer", "auto parts store",
    "veterinary clinic", "pet store",
    "clothing store", "jewelry store", "shoe store",
    "wedding planner", "photographer", "florist",
    "tutoring service", "driving school", "language school",
    "marketing agency", "web design agency", "consulting firm",
    "moving company", "cleaning service", "pest control",
]


# ── Schemas ───────────────────────────────────────────────────────────────────


class DiscoveryTarget(BaseModel):
    """A single pinned (location, category) target with a per-target slider."""

    country: Optional[str] = Field(None, max_length=100)
    country_code: Optional[str] = Field(None, max_length=5)
    region: Optional[str] = Field(None, max_length=150)
    city: str = Field(..., min_length=1, max_length=100)
    sub_area: Optional[str] = Field(None, max_length=150)
    category: str = Field(..., min_length=1, max_length=100)
    location_depth: str = Field("city", max_length=20)
    max_results: int = Field(..., ge=MIN_RESULTS_PER_TARGET)

    @field_validator("location_depth")
    @classmethod
    def _validate_depth(cls, v: str) -> str:
        if v not in ALLOWED_DEPTHS:
            raise ValueError(
                f"location_depth must be one of {ALLOWED_DEPTHS}, got {v!r}"
            )
        return v

    @field_validator("country_code")
    @classmethod
    def _validate_country_code(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        v = v.strip().upper()
        # Google Places' regionCode field accepts ONLY ISO 3166-1 alpha-2
        # (CLDR region codes — 2 letters). A 3-letter alpha-3 code like
        # "IND" or "USA" causes Google to return 400 INVALID_ARGUMENT, so
        # we reject those at write time rather than letting them poison
        # the pipeline run later.
        if len(v) != 2 or not v.isalpha():
            raise ValueError(
                "country_code must be a 2-letter ISO 3166-1 alpha-2 code "
                "(e.g. IN, US, GB, AU). 3-letter codes like IND/USA are "
                "not accepted by Google Places."
            )
        return v

    @field_validator("city", "category")
    @classmethod
    def _strip_required(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("country", "region", "sub_area")
    @classmethod
    def _strip_optional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


class DiscoveryConfigRead(BaseModel):
    auto_mode_enabled: bool
    pinned_targets: List[DiscoveryTarget]
    total_max_results: int
    batch_limit: int
    max_targets: int
    updated_at: Optional[datetime] = None


class DiscoveryConfigUpdate(BaseModel):
    auto_mode_enabled: bool
    pinned_targets: List[DiscoveryTarget] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_targets_envelope(self) -> "DiscoveryConfigUpdate":
        if len(self.pinned_targets) > MAX_TARGETS_PER_FREELANCER:
            raise ValueError(
                f"Too many targets: limit is {MAX_TARGETS_PER_FREELANCER}, "
                f"got {len(self.pinned_targets)}."
            )

        # Sum-vs-cap validation. We check against settings.DISCOVERY_BATCH_LIMIT
        # at the API layer (not the column) so the operator can change the
        # cap via env without a schema migration.
        total = sum(t.max_results for t in self.pinned_targets)
        if total > settings.DISCOVERY_BATCH_LIMIT:
            raise ValueError(
                f"Sum of per-target max_results ({total}) exceeds your daily "
                f"discovery cap ({settings.DISCOVERY_BATCH_LIMIT}). Lower the "
                f"sliders so the total fits."
            )

        # Reject within-payload duplicates (same city+category+depth twice
        # is almost certainly a UI mistake and would waste Google Places
        # calls on identical queries).
        seen = set()
        for t in self.pinned_targets:
            key = (
                (t.city or "").lower(),
                (t.category or "").lower(),
                t.location_depth,
                (t.sub_area or "").lower(),
            )
            if key in seen:
                raise ValueError(
                    f"Duplicate target: city={t.city!r}, sub_area={t.sub_area!r}, "
                    f"category={t.category!r}, depth={t.location_depth!r}."
                )
            seen.add(key)

        return self


class SearchHistoryEntry(BaseModel):
    id: UUID
    country: Optional[str]
    country_code: Optional[str]
    region: Optional[str]
    city: str
    sub_area: Optional[str]
    category: str
    location_depth: str
    results_count: int
    created_at: datetime


class PreviewTarget(BaseModel):
    source: str  # "manual" | "auto"
    city: str
    category: str
    sub_area: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    location_depth: str
    max_results: Optional[int] = None  # only set when source == "manual"


class PreviewResponse(BaseModel):
    mode: str  # "auto" | "manual" | "auto_fallback"
    note: Optional[str] = None
    targets: List[PreviewTarget]


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _get_or_create_config(
    db: AsyncSession, user_id: int
) -> FreelancerDiscoveryConfig:
    """Fetch the freelancer's row, creating a default one on first read.

    Default row has ``auto_mode_enabled=True`` and ``pinned_targets=[]`` so
    behavior matches the pre-feature pipeline until the user opts in.
    """
    res = await db.execute(
        select(FreelancerDiscoveryConfig).where(
            FreelancerDiscoveryConfig.user_id == user_id
        )
    )
    cfg = res.scalars().first()
    if cfg is None:
        cfg = FreelancerDiscoveryConfig(
            user_id=user_id,
            auto_mode_enabled=True,
            pinned_targets=[],
        )
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


def _normalize_targets(raw) -> List[dict]:
    """Coerce the JSON column into a list-of-dicts even if it's None / scalar."""
    if not raw:
        return []
    if isinstance(raw, list):
        return [t for t in raw if isinstance(t, dict)]
    return []


def _config_to_read(cfg: FreelancerDiscoveryConfig) -> DiscoveryConfigRead:
    targets_raw = _normalize_targets(cfg.pinned_targets)
    targets = [DiscoveryTarget(**t) for t in targets_raw]
    return DiscoveryConfigRead(
        auto_mode_enabled=bool(cfg.auto_mode_enabled),
        pinned_targets=targets,
        total_max_results=sum(t.max_results for t in targets),
        batch_limit=settings.DISCOVERY_BATCH_LIMIT,
        max_targets=MAX_TARGETS_PER_FREELANCER,
        updated_at=cfg.updated_at,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=DiscoveryConfigRead)
async def get_discovery_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the calling freelancer's discovery configuration.

    Auto-creates a default row if one doesn't exist yet, so the frontend
    can render the form on first visit without a 404.
    """
    cfg = await _get_or_create_config(db, current_user.id)
    return _config_to_read(cfg)


@router.put("", response_model=DiscoveryConfigRead)
async def update_discovery_config(
    payload: DiscoveryConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace the calling freelancer's discovery configuration.

    Validation (envelope-level) is enforced by ``DiscoveryConfigUpdate``:
    target count, per-target ``max_results`` sum vs ``DISCOVERY_BATCH_LIMIT``,
    duplicate-target detection. Per-target field validation lives on
    ``DiscoveryTarget``.

    A manual-mode config with zero targets is permitted — the pipeline
    treats it as a misconfiguration and falls back to auto for that run
    (with a warning), which is preferable to silently blocking discovery.
    """
    cfg = await _get_or_create_config(db, current_user.id)

    cfg.auto_mode_enabled = payload.auto_mode_enabled
    # Persist as a list of plain dicts so the JSON column stays portable
    # between SQLite (dev) and Postgres (prod).
    cfg.pinned_targets = [t.model_dump(mode="json") for t in payload.pinned_targets]

    await db.commit()
    await db.refresh(cfg)

    logger.info(
        f"Discovery config updated for user {current_user.id}: "
        f"auto={cfg.auto_mode_enabled}, targets={len(cfg.pinned_targets)}"
    )
    return _config_to_read(cfg)


@router.get("/limits")
async def get_discovery_limits():
    """Return the runtime limits the frontend needs to drive validation.

    Public to authenticated callers only (lives behind the global API-key
    + auth gate). No user-specific data here, so safe to share across
    freelancers.
    """
    return {
        "batch_limit": settings.DISCOVERY_BATCH_LIMIT,
        "max_targets": MAX_TARGETS_PER_FREELANCER,
        "min_results_per_target": MIN_RESULTS_PER_TARGET,
        "allowed_depths": list(ALLOWED_DEPTHS),
        "depth_radius_km": {
            "sub_area": 3,
            "city": 10,
            "region": 25,
            "country": 50,
        },
    }


@router.get("/categories")
async def list_suggested_categories():
    """Return the curated category suggestion list for the UI dropdown.

    Free-form text is still accepted on PUT — these are hints, not a
    whitelist, because Google Places' searchText endpoint accepts any
    natural-language category string.
    """
    return {"categories": SUGGESTED_CATEGORIES}


@router.get("/history", response_model=List[SearchHistoryEntry])
async def list_search_history(
    days: int = 60,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the calling freelancer's recent SearchHistory rows.

    Defaults to the same 60-day window the auto-mode dedup logic uses,
    so what the freelancer sees here is exactly what's blocking auto
    targets right now (until they delete entries below).
    """
    if days < 1:
        days = 1
    if days > 365:
        days = 365

    since = datetime.now(timezone.utc) - timedelta(days=days)
    res = await db.execute(
        select(SearchHistory)
        .where(SearchHistory.user_id == current_user.id)
        .where(SearchHistory.created_at >= since)
        .order_by(desc(SearchHistory.created_at))
        .limit(500)
    )
    rows = res.scalars().all()
    return [
        SearchHistoryEntry(
            id=r.id,
            country=r.country,
            country_code=r.country_code,
            region=r.region,
            city=r.city,
            sub_area=r.sub_area,
            category=r.category,
            location_depth=r.location_depth,
            results_count=r.results_count or 0,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.delete("/history/{entry_id}")
async def delete_search_history_entry(
    entry_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete one of the freelancer's SearchHistory rows.

    Useful for clearing the auto-mode dedup so a recently-searched
    (city, category) becomes eligible again on the next run. Strictly
    scoped: the WHERE clause includes ``user_id == current_user.id`` so
    a forged UUID for another user's row is a no-op and we surface 404.
    """
    res = await db.execute(
        delete(SearchHistory)
        .where(SearchHistory.id == entry_id)
        .where(SearchHistory.user_id == current_user.id)
    )
    await db.commit()
    if (res.rowcount or 0) == 0:
        raise HTTPException(status_code=404, detail="History entry not found")
    return {"deleted": True}


@router.delete("/history")
async def clear_all_search_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Wipe every SearchHistory row for the calling freelancer.

    Convenience for "let auto mode start fresh." Same per-user scoping
    rule as the single-entry delete.
    """
    res = await db.execute(
        delete(SearchHistory).where(SearchHistory.user_id == current_user.id)
    )
    await db.commit()
    return {"deleted": int(res.rowcount or 0)}


@router.get("/preview", response_model=PreviewResponse)
async def preview_next_run(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Show what the next discovery run will actually search.

    - Manual mode with targets → returns those targets verbatim.
    - Manual mode with zero targets → returns the auto fallback note;
      we DON'T pre-call Groq here (cost + latency), we just signal that
      the pipeline will pick AI targets at run time.
    - Auto mode → same as above: signal-only, no Groq call.

    The pipeline is the source of truth for what actually runs; this
    endpoint is a UX preview, not a binding contract.
    """
    cfg = await _get_or_create_config(db, current_user.id)
    targets_raw = _normalize_targets(cfg.pinned_targets)

    if not cfg.auto_mode_enabled and targets_raw:
        return PreviewResponse(
            mode="manual",
            targets=[
                PreviewTarget(
                    source="manual",
                    city=t.get("city", ""),
                    category=t.get("category", ""),
                    sub_area=t.get("sub_area"),
                    region=t.get("region"),
                    country=t.get("country"),
                    country_code=t.get("country_code"),
                    location_depth=t.get("location_depth", "city"),
                    max_results=int(t.get("max_results") or 0) or None,
                )
                for t in targets_raw
            ],
        )

    if not cfg.auto_mode_enabled and not targets_raw:
        return PreviewResponse(
            mode="auto_fallback",
            note=(
                "Manual mode is on but no targets are configured. "
                "The next run will fall back to auto mode."
            ),
            targets=[],
        )

    return PreviewResponse(
        mode="auto",
        note=(
            "Auto mode is on. The AI will pick fresh targets at run time, "
            "excluding anything searched in the last 60 days."
        ),
        targets=[],
    )
