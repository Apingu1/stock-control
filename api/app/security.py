# app/security.py
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .db import get_db
from .models import User


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "change_me_stock")  # from env.txt :contentReference[oaicite:3]{index=3}
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))  # 8h default


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, password_hash: str) -> bool:
    return pwd_context.verify(plain, password_hash)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(*, sub: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=JWT_EXPIRES_MINUTES)
    payload = {
        "sub": sub,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden(detail: str = "Forbidden") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise _unauthorized()

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if not username:
            raise _unauthorized("Invalid token (missing sub)")
    except JWTError:
        raise _unauthorized("Invalid token")

    user = db.query(User).filter(User.username == username).one_or_none()
    if user is None:
        raise _unauthorized("User not found")
    if not user.is_active:
        raise _unauthorized("User is inactive")

    return user


def require_role(*allowed_roles: str) -> Callable[[User], User]:
    allowed = {r.upper() for r in allowed_roles}

    def _dep(user: User = Depends(get_current_user)) -> User:
        if (user.role or "").upper() not in allowed:
            raise _forbidden("Insufficient role")
        return user

    return _dep


# Convenience deps
require_admin = require_role("ADMIN")
require_senior = require_role("SENIOR", "ADMIN")
