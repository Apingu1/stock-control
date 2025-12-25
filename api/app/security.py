# app/security.py
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Callable, Set

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .db import get_db
from .models import User, Role, RolePermission


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "change_me_stock")
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


# ---------------------------------------------------------------------------
# Role-based guards (kept for backward compatibility)
# ---------------------------------------------------------------------------

def require_role(*allowed_roles: str) -> Callable[[User], User]:
    allowed = {r.upper() for r in allowed_roles}

    def _dep(user: User = Depends(get_current_user)) -> User:
        if (user.role or "").upper() not in allowed:
            raise _forbidden("Insufficient role")
        return user

    return _dep


# Convenience deps (existing)
require_admin = require_role("ADMIN")
require_senior = require_role("SENIOR", "ADMIN")


# ---------------------------------------------------------------------------
# Permission-based guards (Phase B)
# ---------------------------------------------------------------------------

def _get_permissions_for_role(db: Session, role_name: str) -> Set[str]:
    role = (role_name or "").strip().upper()
    if not role:
        return set()

    # If role row missing, treat as no perms (FK should prevent this)
    exists = db.query(Role).filter(Role.name == role).count()
    if not exists:
        return set()

    rows = (
        db.query(RolePermission.permission_key)
        .filter(
            RolePermission.role_name == role,
            RolePermission.granted.is_(True),
        )
        .all()
    )
    return {r[0] for r in rows}


def require_permission(permission_key: str) -> Callable[[User], User]:
    perm = permission_key.strip()

    def _dep(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        perms = _get_permissions_for_role(db, user.role)
        if perm not in perms:
            raise _forbidden("Missing permission")
        return user

    return _dep


def require_any_permission(*permission_keys: str) -> Callable[[User], User]:
    wanted = {p.strip() for p in permission_keys if p and p.strip()}

    def _dep(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        perms = _get_permissions_for_role(db, user.role)
        if not (perms & wanted):
            raise _forbidden("Missing permission")
        return user

    return _dep


# Admin gate for /admin/*
require_admin_full = require_permission("admin.full")

# Backwards-compatible alias (admin.py expects this name)
require_admin_access = require_admin_full
