"""
Lead qualification and scoring module.
Evaluates discovered leads based on digital footprint heuristics.
"""
from app.models.lead import Lead
from app.modules.qualification.website_checker import check_website
from app.modules.qualification.social_checker import check_social_media

async def qualify_lead(lead: Lead, db) -> tuple[bool, int, str]:
    """
    Computes a qualification score for a given lead by analyzing
    website availability, social media presence, and public rating.
    A higher score indicates a better lead.
    """
    score = 0
    notes = []

    # Initialize upfront to avoid unbound variable risk
    is_dns_valid = False
    is_http_valid = False
    has_socials = False

    if not lead.website_url:
        notes.append("No website URL found in Places data.")
    else:
        is_dns_valid, is_http_valid, _ = await check_website(lead.website_url)

        if is_http_valid:
            score += 40
            notes.append("Valid and reachable website.")
        elif is_dns_valid:
            score += 10
            notes.append("Website domain resolves, but is unreachable over HTTP.")
        else:
            notes.append("Domain does not resolve (NXDOMAIN).")

    if lead.website_url and is_http_valid:
        has_socials, social_profiles = await check_social_media(lead.website_url)
        if has_socials:
            score += 20
            
            # Form social_notes for backwards compatibility with reporting
            platform_names = [p["platform_name"] for p in social_profiles]
            social_str = ", ".join(platform_names)
            notes.append(f"Social media: {social_str}")
            
            # Attach LeadSocialNetwork objects to the Lead model
            from app.models.lead import LeadSocialNetwork
            for profile in social_profiles:
                new_social = LeadSocialNetwork(
                    lead_id=lead.id,
                    platform_name=profile["platform_name"],
                    profile_url=profile["profile_url"]
                )
                db.add(new_social)
        else:
            notes.append("No common social media links found.")

    # Use explicit `is not None` to correctly handle a rating of 0.0
    if lead.rating is not None and lead.rating >= 4.0:
        score += 20
        notes.append(f"High rating ({lead.rating} stars) indicates active business.")
    elif lead.rating is not None:
        score += 5
        notes.append(f"Average/Low rating ({lead.rating} stars).")

    if lead.phone:
        score += 20
        notes.append("Phone number is available.")

    # UPDATE MODEL FIELDS
    lead.has_website = is_http_valid
    lead.has_social_media = has_socials

    is_qualified = score >= 50
    return is_qualified, score, " | ".join(notes)