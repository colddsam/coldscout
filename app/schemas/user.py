"""
User Model Definitions
======================

This module defines the user model classes used throughout the application.
These classes are used to validate and serialize user data.

"""

from typing import Optional
from pydantic import BaseModel, EmailStr

class UserBase(BaseModel):
    """
    Shared properties for user models.

    Attributes:
        email (Optional[EmailStr]): The user's email address.
        is_active (Optional[bool]): Whether the user is active or not.
        is_superuser (bool): Whether the user is a superuser or not.
    """
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    is_superuser: bool = False

class UserCreate(UserBase):
    """
    Properties to receive via API on user creation.

    Attributes:
        email (EmailStr): The user's email address.
        password (str): The user's password.
    """
    email: EmailStr
    password: str

class UserUpdate(UserBase):
    """
    Properties to receive via API on user update.

    Attributes:
        password (Optional[str]): The user's password (optional).
    """
    password: Optional[str] = None

class UserOut(UserBase):
    """
    Properties to return via API on user retrieval.

    Attributes:
        id (int): The user's ID.
    """
    id: int

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

    Attributes:
        sub (Optional[int]): The subject of the token (optional).
    """
    sub: Optional[int] = None