"""
Per-Freelancer Discovery Configuration Model.

Lets each freelancer override the AI-driven "auto" discovery target picker
with a hand-curated list of (location, category) pairs and per-target
result caps.

Semantics
---------
- ``auto_mode_enabled = True`` (default for every existing/new freelancer):
  ``run_discovery_stage`` keeps using ``GroqClient.generate_daily_targets``
  with the 60-day SearchHistory exclusion list. Behavior is identical to
  the pre-feature pipeline, so the migration is a no-op for live users.

- ``auto_mode_enabled = False`` AND ``len(pinned_targets) > 0``:
  the stage iterates ``pinned_targets`` directly. The 60-day dedup is
  intentionally bypassed (the user explicitly asked for these areas), so
  recently-searched locations will be re-queried — Lead.place_id UNIQUE
  still prevents duplicate lead rows.

- ``auto_mode_enabled = False`` AND ``len(pinned_targets) == 0``:
  treated as a misconfiguration. The stage falls back to auto mode for
  this run and logs a warning so the freelancer notices in the UI.

Strict per-user ownership
-------------------------
This config is scoped to ``user_id`` with a UNIQUE constraint, and the
API layer rejects any cross-user read or write — even from superusers.
The user requirement is explicit: "even admin developer can also not
control this; admin also will have his own set of configuration."

pinned_targets shape
--------------------
A list of dicts, each:

    {
        "country":         str | null,           # display name
        "country_code":    str | null,           # ISO 3166-1 alpha-2
        "region":          str | null,
        "city":            str,                  # required
        "sub_area":        str | null,
        "category":        str,                  # required, e.g. "dentist"
        "location_depth":  "sub_area" | "city" | "region" | "country",
        "max_results":     int,                  # slider value, >= 1
    }

Validation that ``sum(t.max_results) <= settings.DISCOVERY_BATCH_LIMIT``
lives in the API layer (so the limit can change at runtime via env without
a DB migration), not in the column definition.
"""
from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func

from app.models.base import Base


class FreelancerDiscoveryConfig(Base):
    __tablename__ = "freelancer_discovery_configs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    auto_mode_enabled = Column(Boolean, nullable=False, default=True)
    pinned_targets = Column(JSON, nullable=False, default=list)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
