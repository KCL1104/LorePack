"""Firebase Authentication dependencies for FastAPI routes."""

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials as firebase_credentials


@dataclass(frozen=True)
class AuthUser:
    """Authenticated user identity extracted from a Firebase ID token."""

    uid: str
    email: str | None = None


_bearer_scheme = HTTPBearer(auto_error=False)
AuthCredentials = Annotated[
    HTTPAuthorizationCredentials | None,
    Depends(_bearer_scheme),
]


@lru_cache(maxsize=1)
def _ensure_firebase_app() -> firebase_admin.App:
    if firebase_admin._apps:
        return firebase_admin.get_app()

    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT")
    if service_account_path:
        cred = firebase_credentials.Certificate(service_account_path)
        return firebase_admin.initialize_app(cred)

    return firebase_admin.initialize_app()


def verify_id_token(id_token: str) -> dict[str, Any]:
    """Verify a Firebase ID token and return decoded claims."""
    _ensure_firebase_app()
    return firebase_auth.verify_id_token(id_token)


async def get_current_user(credentials: AuthCredentials) -> AuthUser:
    """Resolve and validate the current user from Authorization header."""
    bypass_uid = os.getenv("LOREPACK_AUTH_BYPASS_UID", "").strip()
    if bypass_uid:
        return AuthUser(uid=bypass_uid, email=os.getenv("LOREPACK_AUTH_BYPASS_EMAIL"))

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    try:
        decoded = verify_id_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    uid = str(decoded.get("uid", "")).strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    email_claim = decoded.get("email")
    email = str(email_claim).strip() if isinstance(email_claim, str) else None

    return AuthUser(uid=uid, email=email)
