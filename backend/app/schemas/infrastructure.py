"""
Pydantic schemas for the Dynamic API Key Orchestrator admin endpoints.

The plaintext credential travels only on inbound create requests; every
outbound response carries the masked preview (``api_key_preview``) so the
secret never round-trips back to the browser after the initial paste.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.modules.infrastructure.key_manager import (
    VALID_PROVIDERS,
    VALID_USE_CASES,
    use_cases_for_provider,
    WEIGHT_MIN,
    WEIGHT_MAX,
)


class APIProviderBase(BaseModel):
    provider_name: str = Field(..., description="Provider identifier (GROQ, GEMINI, ...).")
    use_case: str = Field("GENERAL", description="Workload bucket.")
    label: Optional[str] = Field(None, max_length=120)
    weight: int = Field(1, ge=WEIGHT_MIN, le=WEIGHT_MAX)

    @field_validator("provider_name")
    @classmethod
    def _validate_provider(cls, v: str) -> str:
        if v not in VALID_PROVIDERS:
            raise ValueError(
                f"Unknown provider_name '{v}'. Expected one of {sorted(VALID_PROVIDERS)}."
            )
        return v

    @field_validator("use_case")
    @classmethod
    def _validate_use_case(cls, v: str) -> str:
        if v not in VALID_USE_CASES:
            raise ValueError(
                f"Unknown use_case '{v}'. Expected one of {sorted(VALID_USE_CASES)}."
            )
        return v


class APIProviderCreate(APIProviderBase):
    api_key: str = Field(
        ...,
        min_length=8,
        max_length=2048,
        description="Plaintext credential. Encrypted before persistence.",
    )

    @field_validator("use_case")
    @classmethod
    def _validate_use_case_for_provider(cls, v: str, info) -> str:
        # ``info.data`` carries the values for previously-validated fields.
        # When ``provider_name`` validation failed, ``data.get`` returns
        # None and we skip — the upstream provider check already produced
        # the actionable error.
        provider = info.data.get("provider_name") if hasattr(info, "data") else None
        if not provider:
            return v
        allowed = use_cases_for_provider(provider)
        if v not in allowed:
            raise ValueError(
                f"use_case '{v}' is not supported by provider '{provider}'. "
                f"Allowed: {allowed}"
            )
        return v

    @field_validator("api_key")
    @classmethod
    def _strip_api_key(cls, v: str) -> str:
        # Operators routinely paste keys with surrounding whitespace.
        # Empty after stripping triggers the standard min_length check.
        stripped = v.strip()
        if not stripped:
            raise ValueError("api_key cannot be blank")
        return stripped


class APIProviderUpdate(BaseModel):
    """All fields optional — only the supplied ones are updated."""

    label: Optional[str] = Field(None, max_length=120)
    use_case: Optional[str] = None
    is_active: Optional[bool] = None
    weight: Optional[int] = Field(None, ge=WEIGHT_MIN, le=WEIGHT_MAX)
    api_key: Optional[str] = Field(None, min_length=8, max_length=2048)

    @field_validator("use_case")
    @classmethod
    def _validate_use_case(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in VALID_USE_CASES:
            raise ValueError(
                f"Unknown use_case '{v}'. Expected one of {sorted(VALID_USE_CASES)}."
            )
        return v

    @field_validator("api_key")
    @classmethod
    def _strip_api_key(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        stripped = v.strip()
        if not stripped:
            raise ValueError("api_key cannot be blank when supplied")
        return stripped


class APIProviderResponse(BaseModel):
    id: UUID
    provider_name: str
    use_case: str
    label: Optional[str]
    api_key_preview: str
    is_active: bool
    weight: int
    usage_count: int
    rate_limit_hits: int
    total_failures: int
    last_used_at: Optional[datetime]
    last_failure_at: Optional[datetime]
    last_failure_reason: Optional[str]
    cooldown_until: Optional[datetime]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class APIProviderStatsRow(BaseModel):
    provider_name: str
    use_case: str
    active_keys: int
    cooldown_keys: int
    disabled_keys: int
    total_usage: int
    total_rate_limit_hits: int
    total_failures: int


class APIProviderStatsResponse(BaseModel):
    rows: list[APIProviderStatsRow]
    totals: APIProviderStatsRow
    valid_providers: list[str]
    valid_use_cases: list[str]


class WeightCollisionRow(BaseModel):
    """One row whose weight got rippled down to make room for a new key."""

    id: UUID
    label: Optional[str]
    use_case: str
    old_weight: int
    new_weight: int


class APIProviderWriteResponse(BaseModel):
    """Returned by create / update. Wraps the record plus any ripple-down
    adjustments so the UI can surface them in a toast."""

    record: APIProviderResponse
    weight_collisions: list[WeightCollisionRow] = Field(default_factory=list)


class WeightPreviewRequest(BaseModel):
    provider_name: str
    weight: int = Field(..., ge=WEIGHT_MIN, le=WEIGHT_MAX)
    exclude_id: Optional[UUID] = None


class WeightPreviewResponse(BaseModel):
    weight_collisions: list[WeightCollisionRow]


class ProviderUseCaseMapResponse(BaseModel):
    """Auto-mapping payload consumed by the admin UI to constrain the
    use_case dropdown by the selected provider."""

    providers: dict[str, list[str]]
    use_cases: list[str]
