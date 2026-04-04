"""
User Model Definitions
======================

This module defines the user model classes used throughout the application.
These classes are used to validate and serialize user data.

Supports both legacy email/password authentication and Supabase Auth
(social logins via Google, GitHub, Facebook, LinkedIn).
"""

from typing import Optional, Union, Literal
from datetime import datetime
from pydantic import BaseModel, EmailStr


# Role and Provider type definitions
UserRole = Literal["client", "freelancer"]
AuthProvider = Literal["email", "google", "github", "facebook", "linkedin"]
UserPlan = Literal["free", "pro", "enterprise"]


class UserBase(BaseModel):
    """
    Shared properties for user models.

    Attributes:
        email (Optional[EmailStr]): The user's email address.
        is_active (Optional[bool]): Whether the user is active or not.
        is_superuser (bool): Whether the user is a superuser or not.
        role (Optional[UserRole]): The user's role ('client' or 'freelancer').
        plan (Optional[UserPlan]): Subscription plan ('free', 'pro', 'enterprise').
        auth_provider (Optional[AuthProvider]): The authentication provider.
        full_name (Optional[str]): The user's full name.
        avatar_url (Optional[str]): The user's avatar URL.
    """
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    is_superuser: bool = False
    role: Optional[UserRole] = "freelancer"
    plan: Optional[UserPlan] = "free"
    auth_provider: Optional[AuthProvider] = "email"
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    """
    Properties to receive via API on user creation.

    Attributes:
        email (EmailStr): The user's email address.
        password (Optional[str]): The user's password (optional for social logins).
        supabase_uid (Optional[str]): The Supabase Auth user ID.
    """
    email: EmailStr
    password: Optional[str] = None
    supabase_uid: Optional[str] = None


class UserUpdate(UserBase):
    """
    Properties to receive via API on user update.

    Attributes:
        password (Optional[str]): The user's password (optional).
        full_name (Optional[str]): The user's full name.
        avatar_url (Optional[str]): The user's avatar URL.
        role (Optional[UserRole]): The user's role.
    """
    password: Optional[str] = None


class UserOut(UserBase):
    """
    Properties to return via API on user retrieval.

    Attributes:
        id (int): The user's ID.
        supabase_uid (Optional[str]): The Supabase Auth user ID.
        plan_expires_at (Optional[datetime]): When the paid plan expires (None for free plan).
    """
    id: int
    supabase_uid: Optional[str] = None
    plan_expires_at: Optional[datetime] = None

    class Config:
        """
        Configuration for the UserOut model.

        Attributes:
            from_attributes (bool): Whether to use attribute names as field names.
        """
        from_attributes = True


class Token(BaseModel):
    """
    JSON payload containing access token.

    Attributes:
        access_token (str): The access token.
        token_type (str): The token type.
        user (UserOut): The associated user.
    """
    access_token: str
    token_type: str
    user: UserOut


class TokenPayload(BaseModel):
    """
    Contents of JWT token.

    Supports both legacy integer user IDs and Supabase UUID strings.

    Attributes:
        sub (Optional[Union[int, str]]): The subject of the token (user ID or Supabase UID).
        email (Optional[str]): The user's email (from Supabase tokens).
        role (Optional[str]): The user's role (from Supabase tokens).
        aud (Optional[str]): The audience claim (Supabase uses 'authenticated').
    """
    sub: Optional[Union[int, str]] = None
    email: Optional[str] = None
    role: Optional[str] = None
    aud: Optional[str] = None


class SupabaseUserSync(BaseModel):
    """
    Request body for syncing a Supabase Auth user to the local database.

    Attributes:
        supabase_uid (str): The Supabase Auth user ID.
        email (EmailStr): The user's email address.
        role (UserRole): The user's role ('client' or 'freelancer').
        auth_provider (AuthProvider): The authentication provider used.
        full_name (Optional[str]): The user's full name from OAuth.
        avatar_url (Optional[str]): The user's avatar URL from OAuth.
    """
    supabase_uid: str
    email: EmailStr
    role: UserRole = "freelancer"
    auth_provider: AuthProvider = "email"
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
