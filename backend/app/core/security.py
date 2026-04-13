"""
Security and Cryptography Utilities.

Provides standard implementations for password hashing (via Passlib/Bcrypt)
and session token generation (via JWT/Jose). These utilities form the
backbone of the administrative authentication layer.

Supports both legacy JWT tokens and Supabase Auth tokens.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional, Dict
from jose import jwt
import bcrypt
import json
import jwt as pyjwt  # PyJWT for Supabase token verification
import httpx
from loguru import logger
from app.config import get_settings

settings = get_settings()

# Cache for Supabase JWKS (public keys for ES256 verification)
_jwks_cache: Optional[Dict] = None


def _get_supabase_jwks() -> Optional[Dict]:
    """Fetch and cache Supabase JWKS (JSON Web Key Set) for ES256 token verification."""
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache

    try:
        url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        response = httpx.get(url, timeout=10.0)
        response.raise_for_status()
        _jwks_cache = response.json()
        logger.info("Successfully fetched and cached Supabase JWKS.")
        return _jwks_cache
    except Exception as e:
        logger.error(f"Failed to fetch Supabase JWKS: {e}")
        return None

ALGORITHM = "HS256"


def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    """
    Generates a signed HS256 JWT representing a successful user session.

    LEGACY: This function is kept for backward compatibility with the X-API-Key
    system and any existing integrations. New authentication should use Supabase Auth.

    Args:
        subject: Usually the unique user ID or email.
        expires_delta: Optional override for token lifespan (defaults to 7 days).

    Returns:
        str: An encoded JWT string.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.APP_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_supabase_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verifies a Supabase Auth JWT token.

    Decodes and validates a JWT issued by Supabase Auth using the project's
    JWT secret (HS256 algorithm). Returns the decoded payload on success.

    Args:
        token: The Supabase JWT token to verify.

    Returns:
        dict: The decoded token payload containing 'sub' (user UUID), 'email', etc.
        None: If verification fails.

    Token Payload Structure (Supabase):
        {
            "sub": "uuid-string",  # Supabase user ID
            "email": "user@example.com",
            "aud": "authenticated",
            "role": "authenticated",
            "exp": 1234567890,
            "user_metadata": {
                "full_name": "John Doe",
                "avatar_url": "https://..."
            },
            "app_metadata": {
                "provider": "google"  # or email, github, etc.
            }
        }
    """
    try:
        # Log header info for debugging algorithm/key mismatch
        unverified_header = pyjwt.get_unverified_header(token)
        alg = unverified_header.get("alg")
        kid = unverified_header.get("kid")
        logger.debug(f"Verifying Supabase token with alg: {alg}, kid: {kid}")

        if alg == "ES256":
            # Supabase now uses ES256 (asymmetric ECDSA) — verify via JWKS public key
            jwks = _get_supabase_jwks()
            if not jwks:
                logger.error("Cannot verify ES256 token: failed to fetch Supabase JWKS.")
                return None

            matching_key = next(
                (k for k in jwks.get("keys", []) if k.get("kid") == kid),
                None
            )
            if not matching_key:
                # kid not found — invalidate cache and retry once
                global _jwks_cache
                _jwks_cache = None
                jwks = _get_supabase_jwks()
                matching_key = next(
                    (k for k in (jwks or {}).get("keys", []) if k.get("kid") == kid),
                    None
                )

            if not matching_key:
                logger.error(f"No matching JWKS key found for kid: {kid}")
                return None

            public_key = pyjwt.algorithms.ECAlgorithm.from_jwk(json.dumps(matching_key))
            # ``leeway`` tolerates small clock skew between Supabase's issuer
            # and the local server. Without it, freshly issued tokens can fail
            # with "token is not yet valid (iat)" during login/sync.
            payload = pyjwt.decode(
                token,
                public_key,
                algorithms=["ES256"],
                options={"verify_aud": False},
                leeway=60,
            )
            return payload
        else:
            # Legacy HS256/RS256 — verify with the project JWT secret
            if not settings.SUPABASE_JWT_SECRET:
                logger.warning(
                    "No SUPABASE_JWT_SECRET configured — HS256/RS256 Supabase tokens "
                    "cannot be verified. Set SUPABASE_JWT_SECRET for full auth coverage."
                )
                return None
            payload = pyjwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256", "RS256"],
                options={"verify_aud": False},
                leeway=60,
            )
            return payload
    except pyjwt.ExpiredSignatureError:
        logger.warning("Supabase token has expired.")
        return None
    except pyjwt.InvalidAudienceError:
        logger.error("Supabase token has an invalid audience.")
        return None
    except pyjwt.InvalidSignatureError:
        logger.error("Supabase token has an invalid signature.")
        return None
    except pyjwt.InvalidTokenError as e:
        logger.error(f"Supabase token is invalid: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error during Supabase token verification: {str(e)}")
        return None


def verify_legacy_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Verifies a legacy JWT token issued by this application.

    Used for backward compatibility with existing admin sessions and
    the X-API-Key cron job system.

    Args:
        token: The JWT token to verify.

    Returns:
        dict: The decoded token payload containing 'sub' (user ID).
        None: If verification fails.
    """
    try:
        payload = jwt.decode(
            token, settings.APP_SECRET_KEY, algorithms=[ALGORITHM], leeway=60
        )
        return payload
    except Exception:
        return None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plaintext password against a hashed representation.
    """
    password_byte_enc = plain_password.encode('utf-8')
    hashed_password_byte_enc = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_byte_enc, hashed_password_byte_enc)


def get_password_hash(password: str) -> str:
    """
    Generates a secure hash for a given password using bcrypt.
    """
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_password.decode('utf-8')
