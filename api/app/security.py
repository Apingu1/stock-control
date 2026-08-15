# app/security.py
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Callable, Set
from uuid import uuid4

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .db import get_db
from .models import (
    AuthSession,
    Permission,
    Role,
    RolePermission,
    SecuritySessionSetting,
    User,
)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

JWT_SECRET = os.getenv("JWT_SECRET", "change_me_stock")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))  # 8h default
DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 15
MIN_INACTIVITY_TIMEOUT_MINUTES = 5
MAX_INACTIVITY_TIMEOUT_MINUTES = 120

ACCESS_TOKEN_PURPOSE = "access"
PASSWORD_CHANGE_TOKEN_PURPOSE = "password_change"


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
def create_access_token(
    *,
    sub: str,
    role: str,
    session_id: str,
    purpose: str = ACCESS_TOKEN_PURPOSE,
    expires_at: datetime | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    exp = expires_at or (now + timedelta(minutes=JWT_EXPIRES_MINUTES))
    payload = {
        "sub": sub,
        "role": role,
        "sid": session_id,
        "purpose": purpose,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_inactivity_timeout_minutes(db: Session) -> int:
    row = (
        db.query(SecuritySessionSetting)
        .filter(SecuritySessionSetting.id == 1)
        .one_or_none()
    )
    if row is None:
        return DEFAULT_INACTIVITY_TIMEOUT_MINUTES
    value = int(row.inactivity_timeout_minutes)
    return max(MIN_INACTIVITY_TIMEOUT_MINUTES, min(MAX_INACTIVITY_TIMEOUT_MINUTES, value))


def create_auth_session(db: Session, user: User) -> AuthSession:
    now = datetime.now(timezone.utc)
    session = AuthSession(
        session_id=str(uuid4()),
        user_id=user.id,
        created_at=now,
        last_activity_at=now,
        absolute_expires_at=now + timedelta(minutes=JWT_EXPIRES_MINUTES),
    )
    db.add(session)
    db.flush()
    return session


def revoke_user_sessions(db: Session, user_id: int) -> None:
    now = datetime.now(timezone.utc)
    (
        db.query(AuthSession)
        .filter(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .update({AuthSession.revoked_at: now}, synchronize_session=False)
    )


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _forbidden(detail: str = "Forbidden") -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: AuthSession
    token_payload: dict[str, Any]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _load_auth_context(token: str, db: Session) -> AuthContext:
    if not token:
        raise _unauthorized()

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username: Optional[str] = payload.get("sub")
        session_id: Optional[str] = payload.get("sid")
        if not username or not session_id:
            raise _unauthorized("Invalid session token")
    except JWTError:
        raise _unauthorized("Invalid or expired session")

    user = db.query(User).filter(User.username == username).one_or_none()
    if user is None:
        raise _unauthorized("User not found")
    if not user.is_active:
        raise _unauthorized("User is inactive")

    session = (
        db.query(AuthSession)
        .filter(AuthSession.session_id == session_id, AuthSession.user_id == user.id)
        .one_or_none()
    )
    if session is None or session.revoked_at is not None:
        raise _unauthorized("Session has ended")

    now = datetime.now(timezone.utc)
    absolute_expiry = _as_utc(session.absolute_expires_at)
    idle_expiry = _as_utc(session.last_activity_at) + timedelta(
        minutes=get_inactivity_timeout_minutes(db)
    )
    if now >= absolute_expiry or now >= idle_expiry:
        session.revoked_at = now
        try:
            db.commit()
        except Exception:
            db.rollback()
        if now >= idle_expiry:
            raise _unauthorized("Session expired due to inactivity")
        raise _unauthorized("Session expired")

    return AuthContext(user=user, session=session, token_payload=payload)


def get_any_auth_context(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> AuthContext:
    return _load_auth_context(token, db)


def get_password_change_context(
    context: AuthContext = Depends(get_any_auth_context),
) -> AuthContext:
    if context.token_payload.get("purpose") != PASSWORD_CHANGE_TOKEN_PURPOSE:
        raise _forbidden("This session is not authorised for a password change")
    if not context.user.must_change_password:
        raise _forbidden("Password change is not required")
    return context


def get_current_auth_context(
    context: AuthContext = Depends(get_any_auth_context),
) -> AuthContext:
    if context.token_payload.get("purpose") != ACCESS_TOKEN_PURPOSE:
        raise _forbidden("Password change required before accessing the system")
    if context.user.must_change_password:
        raise _forbidden("Password change required before accessing the system")
    return context


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
def get_current_user(
    context: AuthContext = Depends(get_current_auth_context),
) -> User:
    return context.user


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

    # If role row missing, treat as no perms (FK should prevent this).
    exists = db.query(Role).filter(Role.name == role).count()
    if not exists:
        return set()

    # ADMIN is the system owner role. Resolve it dynamically from the permission
    # catalogue so newly added features cannot accidentally be hidden from an
    # administrator merely because an older role_permissions seed pre-dated them.
    # The database migration still inserts matrix rows so the Admin UI accurately
    # displays every permission as granted.
    if role == "ADMIN":
        rows = db.query(Permission.key).all()
        return {row[0] for row in rows}

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


def user_has_permission(db: Session, user: User, permission_key: str) -> bool:
    """Utility for routers: check if a user has a permission without raising."""
    try:
        perms = _get_permissions_for_role(db, user.role)
        return permission_key.strip() in perms
    except Exception:
        return False


# Admin gate for /admin/*
require_admin_full = require_permission("admin.full")

# Backwards-compatible alias (admin.py expects this name)
require_admin_access = require_admin_full
