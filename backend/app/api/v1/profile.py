"""
User Profile Management API.

Provides endpoints for managing user profiles, business profiles,
freelancer profiles, portfolio items, and profile visibility settings.

Public endpoints (no auth required):
  - GET /profile/u/{username}   — View a public profile
  - GET /profile/check-username/{username} — Check username availability

Private endpoints (auth required):
  - GET  /profile/me             — Get own profile
  - PUT  /profile/me             — Update own profile
  - POST /profile/me/setup       — Initial profile setup (create with username)
  - POST /profile/me/upload-photo   — Upload profile photo
  - POST /profile/me/upload-banner  — Upload profile banner
  - GET  /profile/me/business    — Get own business profile
  - PUT  /profile/me/business    — Update business profile
  - GET  /profile/me/freelancer  — Get own freelancer profile
  - PUT  /profile/me/freelancer  — Update freelancer profile
  - GET  /profile/me/portfolio   — List own portfolio items
  - POST /profile/me/portfolio   — Create portfolio item
  - PUT  /profile/me/portfolio/{id} — Update portfolio item
  - DELETE /profile/me/portfolio/{id} — Delete portfolio item
"""

import uuid
import base64
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from loguru import logger

from app.api import deps
from app.core.database import get_db
from app.models.user import User
from app.models.profile import UserProfile, BusinessProfile, FreelancerProfile, PortfolioItem
from app.schemas.profile import (
    UserProfileCreate, UserProfileUpdate, UserProfileOut,
    BusinessProfileUpdate, BusinessProfileOut,
    FreelancerProfileUpdate, FreelancerProfileOut,
    PortfolioItemCreate, PortfolioItemUpdate, PortfolioItemOut,
    PublicProfileOut, UsernameCheckResponse, FileUploadResponse,
    USERNAME_PATTERN, RESERVED_USERNAMES,
)
from app.config import get_settings

router = APIRouter(prefix="/profile", tags=["profile"])
settings = get_settings()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_profile_out(profile: UserProfile, user: User) -> UserProfileOut:
    """Merge user fields into the profile response."""
    data = {c.name: getattr(profile, c.name) for c in profile.__table__.columns}
    data["email"] = user.email
    data["full_name"] = user.full_name
    data["role"] = user.role
    data["plan"] = user.plan
    data["avatar_url"] = user.avatar_url
    return UserProfileOut(**data)


async def _get_or_404(db: AsyncSession, model, user_id: int, label: str):
    result = await db.execute(select(model).where(model.user_id == user_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return obj


async def _upload_image_to_supabase(
    file: UploadFile, folder: str, user_id: int, user_jwt: str
) -> str:
    """Upload an image to Supabase Storage and return the public URL."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size must be under 5 MB")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    filename = f"{folder}/{user_id}/{uuid.uuid4().hex}.{ext}"

    import httpx

    storage_url = f"{settings.SUPABASE_URL}/storage/v1/object/profiles/{filename}"
    headers = {
        "Authorization": f"Bearer {user_jwt}",
        "apikey": settings.SUPABASE_ANON_KEY,
        "Content-Type": file.content_type or "application/octet-stream",
        "x-upsert": "true",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(storage_url, content=content, headers=headers)

    if resp.status_code not in (200, 201):
        logger.error(f"Supabase Storage upload failed: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=500, detail="File upload failed")

    public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/profiles/{filename}"
    return public_url


# ── Public Endpoints ──────────────────────────────────────────────────────────

@router.get("/check-username/{username}", response_model=UsernameCheckResponse)
async def check_username_availability(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Check if a username is available."""
    username = username.strip().lower()

    if not USERNAME_PATTERN.match(username):
        return UsernameCheckResponse(
            available=False,
            message="Username must start with a letter, contain only letters, numbers, and underscores (3-50 chars)."
        )

    if username in RESERVED_USERNAMES:
        return UsernameCheckResponse(available=False, message="This username is reserved.")

    result = await db.execute(select(UserProfile).where(UserProfile.username == username))
    exists = result.scalars().first()

    if exists:
        return UsernameCheckResponse(available=False, message="This username is already taken.")

    return UsernameCheckResponse(available=True, message="Username is available.")


@router.get("/u/{username}", response_model=PublicProfileOut)
async def get_public_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """View a public user profile by username."""
    username = username.strip().lower()

    result = await db.execute(select(UserProfile).where(UserProfile.username == username))
    profile = result.scalars().first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if not profile.is_public:
        raise HTTPException(status_code=403, detail="This profile is private")

    user = profile.user

    out = PublicProfileOut(
        username=profile.username,
        full_name=user.full_name,
        role=user.role,
        plan=user.plan,
        bio=profile.bio,
        location=profile.location if profile.show_location else None,
        website=profile.website,
        profile_photo_url=profile.profile_photo_url,
        banner_url=profile.banner_url,
        avatar_url=user.avatar_url,
        email=user.email if profile.show_email else None,
        phone=profile.phone if profile.show_phone else None,
        date_of_birth=profile.date_of_birth if profile.show_date_of_birth else None,
        gender=profile.gender,
        member_since=profile.created_at,
    )

    # Attach role-specific profiles
    if user.role == "client":
        result = await db.execute(select(BusinessProfile).where(BusinessProfile.user_id == user.id))
        biz = result.scalars().first()
        if biz and biz.is_public:
            out.business = BusinessProfileOut.model_validate(biz)
    else:
        result = await db.execute(select(FreelancerProfile).where(FreelancerProfile.user_id == user.id))
        fl = result.scalars().first()
        if fl and fl.is_public:
            fl_out = FreelancerProfileOut.model_validate(fl)
            if not fl.show_rates:
                fl_out.hourly_rate = None
            if not fl.show_availability:
                fl_out.availability = None
            out.freelancer = fl_out

        # Portfolio items (only public ones)
        result = await db.execute(
            select(PortfolioItem)
            .where(PortfolioItem.user_id == user.id, PortfolioItem.is_public == True)
            .order_by(PortfolioItem.display_order, PortfolioItem.created_at.desc())
        )
        items = result.scalars().all()
        if items:
            out.portfolio = [PortfolioItemOut.model_validate(i) for i in items]

    return out


# ── Own Profile ───────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserProfileOut)
async def get_my_profile(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get the authenticated user's profile."""
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalars().first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not set up yet. Please create your profile first.")

    return _build_profile_out(profile, current_user)


@router.post("/me/setup", response_model=UserProfileOut, status_code=201)
async def setup_profile(
    payload: UserProfileCreate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Initial profile setup — creates the user profile with a unique username."""
    # Check if profile already exists
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    if result.scalars().first():
        raise HTTPException(status_code=409, detail="Profile already exists. Use PUT /profile/me to update.")

    # Check username uniqueness
    result = await db.execute(select(UserProfile).where(UserProfile.username == payload.username))
    if result.scalars().first():
        raise HTTPException(status_code=409, detail="Username is already taken.")

    profile = UserProfile(
        user_id=current_user.id,
        username=payload.username,
        profile_photo_url=current_user.avatar_url,  # Seed from OAuth avatar
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    logger.info(f"Profile created for user {current_user.email} with username @{payload.username}")
    return _build_profile_out(profile, current_user)


@router.put("/me", response_model=UserProfileOut)
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update the authenticated user's profile."""
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalars().first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not set up yet.")

    update_data = payload.model_dump(exclude_unset=True)

    # If username is being changed, check uniqueness
    if "username" in update_data and update_data["username"] != profile.username:
        result = await db.execute(
            select(UserProfile).where(UserProfile.username == update_data["username"])
        )
        if result.scalars().first():
            raise HTTPException(status_code=409, detail="Username is already taken.")

    for field, value in update_data.items():
        setattr(profile, field, value)

    # Also update full_name on the User model if it was indirectly changed
    await db.commit()
    await db.refresh(profile)

    return _build_profile_out(profile, current_user)


# ── File Uploads ──────────────────────────────────────────────────────────────

@router.post("/me/upload-photo", response_model=FileUploadResponse)
async def upload_profile_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Upload a profile photo. Updates the profile_photo_url automatically."""
    jwt = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    url = await _upload_image_to_supabase(file, "photos", current_user.id, jwt)

    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalars().first()
    if profile:
        profile.profile_photo_url = url
        await db.commit()

    return FileUploadResponse(url=url, message="Profile photo uploaded successfully.")


@router.post("/me/upload-banner", response_model=FileUploadResponse)
async def upload_profile_banner(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Upload a profile banner. Updates the banner_url automatically."""
    jwt = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    url = await _upload_image_to_supabase(file, "banners", current_user.id, jwt)

    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalars().first()
    if profile:
        profile.banner_url = url
        await db.commit()

    return FileUploadResponse(url=url, message="Profile banner uploaded successfully.")


# ── Business Profile ──────────────────────────────────────────────────────────

@router.get("/me/business", response_model=BusinessProfileOut)
async def get_my_business_profile(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get the authenticated user's business profile (auto-creates if missing)."""
    result = await db.execute(select(BusinessProfile).where(BusinessProfile.user_id == current_user.id))
    profile = result.scalars().first()
    if not profile:
        profile = BusinessProfile(user_id=current_user.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.put("/me/business", response_model=BusinessProfileOut)
async def update_my_business_profile(
    payload: BusinessProfileUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create or update the business profile (upsert)."""
    result = await db.execute(select(BusinessProfile).where(BusinessProfile.user_id == current_user.id))
    profile = result.scalars().first()

    update_data = payload.model_dump(exclude_unset=True)

    if not profile:
        profile = BusinessProfile(user_id=current_user.id, **update_data)
        db.add(profile)
    else:
        for field, value in update_data.items():
            setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


# ── Freelancer Profile ────────────────────────────────────────────────────────

@router.get("/me/freelancer", response_model=FreelancerProfileOut)
async def get_my_freelancer_profile(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Get the authenticated user's freelancer profile (auto-creates if missing)."""
    result = await db.execute(select(FreelancerProfile).where(FreelancerProfile.user_id == current_user.id))
    profile = result.scalars().first()
    if not profile:
        profile = FreelancerProfile(user_id=current_user.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.put("/me/freelancer", response_model=FreelancerProfileOut)
async def update_my_freelancer_profile(
    payload: FreelancerProfileUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Create or update the freelancer profile (upsert)."""
    result = await db.execute(select(FreelancerProfile).where(FreelancerProfile.user_id == current_user.id))
    profile = result.scalars().first()

    update_data = payload.model_dump(exclude_unset=True)

    if not profile:
        profile = FreelancerProfile(user_id=current_user.id, **update_data)
        db.add(profile)
    else:
        for field, value in update_data.items():
            setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


# ── Portfolio ─────────────────────────────────────────────────────────────────

@router.get("/me/portfolio", response_model=list[PortfolioItemOut])
async def list_my_portfolio(
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """List all portfolio items for the authenticated user."""
    result = await db.execute(
        select(PortfolioItem)
        .where(PortfolioItem.user_id == current_user.id)
        .order_by(PortfolioItem.display_order, PortfolioItem.created_at.desc())
    )
    return result.scalars().all()


@router.post("/me/portfolio", response_model=PortfolioItemOut, status_code=201)
async def create_portfolio_item(
    payload: PortfolioItemCreate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Add a new portfolio item."""
    item = PortfolioItem(user_id=current_user.id, **payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/me/portfolio/{item_id}", response_model=PortfolioItemOut)
async def update_portfolio_item(
    item_id: int,
    payload: PortfolioItemUpdate,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Update a portfolio item owned by the authenticated user."""
    result = await db.execute(
        select(PortfolioItem).where(
            PortfolioItem.id == item_id,
            PortfolioItem.user_id == current_user.id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Portfolio item not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/me/portfolio/{item_id}", status_code=204)
async def delete_portfolio_item(
    item_id: int,
    current_user: User = Depends(deps.get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a portfolio item owned by the authenticated user."""
    result = await db.execute(
        select(PortfolioItem).where(
            PortfolioItem.id == item_id,
            PortfolioItem.user_id == current_user.id,
        )
    )
    item = result.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Portfolio item not found")

    await db.delete(item)
    await db.commit()
