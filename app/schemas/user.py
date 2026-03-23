from typing import Optional
from pydantic import BaseModel, EmailStr

# Shared properties
class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = True
    is_superuser: bool = False

# Properties to receive via API on creation
class UserCreate(UserBase):
    email: EmailStr
    password: str

# Properties to receive via API on update
class UserUpdate(UserBase):
    password: Optional[str] = None

class UserOut(UserBase):
    id: int

    class Config:
        from_attributes = True

# JSON payload containing access token
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

# Contents of JWT token
class TokenPayload(BaseModel):
    sub: Optional[int] = None
