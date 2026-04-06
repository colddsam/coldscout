"""
Lead qualification and scoring module.
Evaluates discovered leads based on digital footprint heuristics.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING PHILOSOPHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This system targets businesses that NEED web/digital services.
A HIGHER score = weaker digital presence (more need) + viable paying client.
A score near 0 = strong digital presence = NOT a good lead for a web designer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIGITAL NEED signals  (max 60 pts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No website at all                       → +50   ← best lead
Website exists but HTTP unreachable     → +40   ← site is down / needs rebuild
Website exists, DNS fails only          → +35   ← domain broken / parked
Site hosted on free builder (Wix etc.)  → +15   ← needs professional site
No SSL (http:// only)                   → +10   ← outdated
Not mobile-responsive                   → +10   ← outdated
Copyright year < 2020                   → +10   ← severely stale
No social media found (or unverifiable) → +10   ← weak digital presence

Note: when no website exists, social check cannot run.
The +10 social bonus is granted automatically since the business
provably has no embedded social links anywhere.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSINESS VIABILITY signals  (max 40 pts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Review count > 50                       → +15   ← established business
Review count 20–50                      → +10   ← good traction
Review count 5–19                       → +5    ← growing
Review count 1–4                        → +2    ← just starting
Rating >= 4.0                           → +15   ← respected locally
Rating 3.0–3.9                          → +8    ← active, room to grow
Rating < 3.0                            → +2    ← active but struggling
Phone number present                    → +10   ← directly reachable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIER ASSIGNMENT  (requires email OR phone to qualify as A/B/C)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A  score >= 75 AND reachable  → Priority — call or email today
B  score >= 50 AND reachable  → Standard outreach sequence
C  score >= 30 AND reachable  → Low-touch bulk sequence
D  score <  30 OR unreachable → Skip

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALIFICATION THRESHOLD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
score >= 50  AND  (lead.email OR lead.phone)

OUTREACH PATH SET IN daily_pipeline.py:
  has email              → status = "qualified"        (automated email sequence)
  phone only, no email   → status = "phone_qualified"  (manual call / WhatsApp alert)
  not qualified          → status = "rejected"
"""
import asyncio
from loguru import logger
from app.models.lead import Lead
from app.modules.qualification.website_checker import check_website, get_website_quality
from app.modules.qualification.social_checker import check_social_media


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _score_digital_need(
    website_url: str | None,
    is_dns_valid: bool,
    is_http_valid: bool,
    quality: dict,
    has_socials: bool,
) -> tuple[int, list[str]]:
    """
    Returns how much the business needs digital services.
    Higher = more need = better prospect.
    """
    score = 0
    notes: list[str] = []

    if not website_url:
        score += 50
        notes.append("No website — maximum digital need.")
        # Cannot verify social presence without a live site; grant bonus automatically
        score += 10
        notes.append("Social media presence unverifiable (no website).")
        return score, notes

    # Website URL present — evaluate quality
    if not is_dns_valid:
        score += 35
        notes.append("Domain does not resolve (NXDOMAIN) — site completely broken.")
    elif not is_http_valid:
        score += 40
        notes.append("Website unreachable (DNS ok, HTTP failed) — site is down.")
    else:
        notes.append("Website is live and reachable.")

        if quality.get("is_free_builder"):
            score += 15
            notes.append(
                "Site hosted on a free builder (Wix/Weebly/etc.) — needs professional rebuild."
            )
        if not quality.get("has_ssl"):
            score += 10
            notes.append("No SSL (http only) — outdated and untrustworthy to visitors.")
        if not quality.get("is_mobile_friendly"):
            score += 10
            notes.append("Site is not mobile-responsive — major UX problem.")

        copyright_year = quality.get("copyright_year")
        if copyright_year and copyright_year < 2020:
            score += 10
            notes.append(f"Website copyright year is {copyright_year} — severely outdated.")

        if not has_socials:
            score += 10
            notes.append("No social media profiles linked from website.")
        else:
            notes.append("Social media profiles found on website.")

    return score, notes


def _score_viability(lead: Lead) -> tuple[int, list[str]]:
    """
    Returns how viable the business is as a paying client.
    Higher = more established and more likely to invest.
    """
    score = 0
    notes: list[str] = []

    count = lead.review_count or 0
    if count > 50:
        score += 15
        notes.append(f"High review count ({count}) — established business.")
    elif count >= 20:
        score += 10
        notes.append(f"Good review count ({count}) — solid traction.")
    elif count >= 5:
        score += 5
        notes.append(f"Some reviews ({count}) — growing business.")
    elif count >= 1:
        score += 2
        notes.append(f"Few reviews ({count}) — early-stage business.")
    else:
        notes.append("No reviews — new or inactive business.")

    rating = lead.rating
    if rating is not None and rating >= 4.0:
        score += 15
        notes.append(f"Strong rating ({rating}★) — respected in the community.")
    elif rating is not None and rating >= 3.0:
        score += 8
        notes.append(f"Average rating ({rating}★) — active but room to improve.")
    elif rating is not None:
        score += 2
        notes.append(f"Low rating ({rating}★) — may have reputation issues.")
    else:
        notes.append("No Google rating — new or unclaimed listing.")

    if lead.phone:
        score += 10
        notes.append("Phone number available — directly reachable.")
    else:
        notes.append("No phone number found.")

    return score, notes


def _assign_tier(score: int, has_email: bool, has_phone: bool) -> str:
    """
    Assigns a single-character lead tier.

    Stored as VARCHAR(2) — values are always 1 character.
    Requires at least one reachable contact method (email or phone).

    Args:
        score (int):      Total qualification score 0–100.
        has_email (bool): Outreach email available.
        has_phone (bool): Phone number available.

    Returns:
        str: 'A', 'B', 'C', or 'D'.
    """
    if not (has_email or has_phone):
        return "D"
    if score >= 75:
        return "A"
    if score >= 50:
        return "B"
    if score >= 30:
        return "C"
    return "D"


# ─────────────────────────────────────────────────────────────────────────────
# Public interface
# ─────────────────────────────────────────────────────────────────────────────

async def qualify_lead(lead: Lead, db) -> tuple[bool, int, str]:
    """
    Computes a qualification score for a given lead by analyzing
    website quality, social presence, review metrics, and reachability.

    A higher score means the business NEEDS your services more
    AND is a viable paying prospect.

    Modifies the lead in-place:
        lead.has_website
        lead.has_social_media
        lead.lead_tier
        lead.is_mobile_responsive   (when quality data available)
        lead.website_copyright_year (when quality data available)

    Args:
        lead (Lead): The lead ORM instance to evaluate.
        db:          Active async SQLAlchemy session (for LeadSocialNetwork rows).

    Returns:
        tuple[bool, int, str]:
            - is_qualified: True when score >= 50 AND (email OR phone).
            - score:        Raw numeric score 0–100.
            - notes:        Pipe-separated human-readable score explanation.
    """
    all_notes: list[str] = []

    # Defaults
    is_dns_valid: bool = False
    is_http_valid: bool = False
    has_socials: bool = False
    quality: dict = {}

    # ── Website checks ────────────────────────────────────────────────────────
    if lead.website_url:
        # Run DNS/HTTP check and quality fetch concurrently with an overall timeout
        # Prevents slow/hanging domains from blocking the entire qualification batch
        try:
            (is_dns_valid, is_http_valid, _), quality = await asyncio.wait_for(
                asyncio.gather(
                    check_website(lead.website_url),
                    get_website_quality(lead.website_url),
                ),
                timeout=20.0,
            )
        except asyncio.TimeoutError:
            logger.warning(
                f"Website checks timed out for '{lead.business_name}' "
                f"({lead.website_url}). Quality assessment skipped."
            )
            all_notes.append("Website check timed out — quality assessment skipped.")

    # ── Social check (only when site is confirmed live) ───────────────────────
    if lead.website_url and is_http_valid:
        has_socials, social_profiles = await check_social_media(lead.website_url)
        if has_socials:
            from app.models.lead import LeadSocialNetwork
            from sqlalchemy import delete

            # Clear existing socials first to ensure idempotency if re-qualified
            await db.execute(
                delete(LeadSocialNetwork).where(LeadSocialNetwork.lead_id == lead.id)
            )

            for profile in social_profiles:
                db.add(
                    LeadSocialNetwork(
                        lead_id=lead.id,
                        platform=profile["platform"],
                        url=profile["url"],
                    )
                )

    # ── Score components ──────────────────────────────────────────────────────
    need_score, need_notes = _score_digital_need(
        lead.website_url, is_dns_valid, is_http_valid, quality, has_socials
    )
    all_notes.extend(need_notes)

    viability_score, viability_notes = _score_viability(lead)
    all_notes.extend(viability_notes)

    total_score = min(need_score + viability_score, 100)

    # ── Update model fields ───────────────────────────────────────────────────
    lead.has_website = is_http_valid
    lead.has_social_media = has_socials
    lead.lead_tier = _assign_tier(
        total_score,
        has_email=bool(lead.email),
        has_phone=bool(lead.phone),
    )

    if quality:
        if hasattr(lead, "is_mobile_responsive"):
            lead.is_mobile_responsive = quality.get("is_mobile_friendly")
        if hasattr(lead, "website_copyright_year"):
            lead.website_copyright_year = quality.get("copyright_year")

    # ── Qualification gate: score threshold + at least one contact channel ────
    is_qualified = total_score >= 50 and bool(lead.email or lead.phone)

    logger.debug(
        f"Scored '{lead.business_name}': {total_score}/100 "
        f"(need={need_score}, viability={viability_score}) | "
        f"tier={lead.lead_tier} | email={bool(lead.email)} | "
        f"phone={bool(lead.phone)} | qualified={is_qualified}"
    )

    return is_qualified, total_score, " | ".join(all_notes)