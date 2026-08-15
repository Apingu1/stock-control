from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..audit_logger import log_security_event
from ..db import get_db
from ..models import SecuritySessionSetting, User
from ..schemas import (
    LoginRequest,
    MyPermissionsOut,
    PasswordChangeRequest,
    SessionSettingsOut,
    TokenOut,
    UserMeOut,
)
from ..security import (
    ACCESS_TOKEN_PURPOSE,
    PASSWORD_CHANGE_TOKEN_PURPOSE,
    AuthContext,
    _get_permissions_for_role,
    create_access_token,
    create_auth_session,
    get_any_auth_context,
    get_current_auth_context,
    get_current_user,
    get_inactivity_timeout_minutes,
    get_password_change_context,
    hash_password,
    revoke_user_sessions,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

MIN_PASSWORD_LENGTH = 8


def _client_details(request: Request) -> tuple[str | None, str | None]:
    ip = request.client.host if request.client else None
    return ip, request.headers.get("user-agent")


def _token_for(user: User, session, *, purpose: str) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(
            sub=user.username,
            role=user.role,
            session_id=session.session_id,
            purpose=purpose,
            expires_at=session.absolute_expires_at,
        ),
        token_type="bearer",
        must_change_password=bool(user.must_change_password),
    )


def _login_impl(payload: LoginRequest, db: Session) -> TokenOut:
    username = payload.username.strip()
    user = db.query(User).filter(User.username == username).one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session = create_auth_session(db, user)
    purpose = (
        PASSWORD_CHANGE_TOKEN_PURPOSE
        if user.must_change_password
        else ACCESS_TOKEN_PURPOSE
    )
    return _token_for(user, session, purpose=purpose)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenOut:
    ip, ua = _client_details(request)
    username = payload.username.strip()

    try:
        token = _login_impl(payload, db)
        user = db.query(User).filter(User.username == username).one_or_none()
        log_security_event(
            db,
            event_type="LOGIN_SUCCESS",
            actor_username=username,
            actor_role=(user.role if user else None),
            target_type="AUTH",
            target_ref=username,
            success=True,
            ip_address=ip,
            user_agent=ua,
            meta={"password_change_required": bool(user and user.must_change_password)},
        )
        db.commit()
        return token
    except HTTPException:
        db.rollback()
        log_security_event(
            db,
            event_type="LOGIN_FAIL",
            actor_username=username,
            target_type="AUTH",
            target_ref=username,
            success=False,
            ip_address=ip,
            user_agent=ua,
        )
        db.commit()
        raise


@router.post("/login/", response_model=TokenOut, include_in_schema=False)
def login_slash(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenOut:
    return login(payload, request, db)


@router.post("/change-password", response_model=TokenOut)
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    context: AuthContext = Depends(get_password_change_context),
    db: Session = Depends(get_db),
) -> TokenOut:
    new_password = payload.new_password
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"New password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    if verify_password(new_password, context.user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="New password must be different from the temporary password",
        )

    context.user.password_hash = hash_password(new_password)
    context.user.must_change_password = False
    revoke_user_sessions(db, context.user.id)
    db.flush()
    new_session = create_auth_session(db, context.user)

    ip, ua = _client_details(request)
    log_security_event(
        db,
        event_type="PASSWORD_CHANGED",
        actor_username=context.user.username,
        actor_role=context.user.role,
        target_type="USER",
        target_ref=context.user.username,
        reason="Mandatory password change completed",
        success=True,
        ip_address=ip,
        user_agent=ua,
    )
    db.commit()
    return _token_for(context.user, new_session, purpose=ACCESS_TOKEN_PURPOSE)


@router.post("/activity")
def record_human_activity(
    context: AuthContext = Depends(get_current_auth_context),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    now = datetime.now(timezone.utc)
    last = context.session.last_activity_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if now - last >= timedelta(seconds=20):
        context.session.last_activity_at = now
        db.commit()
    return {"ok": True}


@router.post("/logout")
def logout(
    request: Request,
    context: AuthContext = Depends(get_any_auth_context),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if context.session.revoked_at is None:
        context.session.revoked_at = datetime.now(timezone.utc)
    ip, ua = _client_details(request)
    log_security_event(
        db,
        event_type="LOGOUT",
        actor_username=context.user.username,
        actor_role=context.user.role,
        target_type="AUTH",
        target_ref=context.user.username,
        success=True,
        ip_address=ip,
        user_agent=ua,
    )
    db.commit()
    return {"ok": True}


@router.get("/session-settings", response_model=SessionSettingsOut)
def session_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> SessionSettingsOut:
    row = (
        db.query(SecuritySessionSetting)
        .filter(SecuritySessionSetting.id == 1)
        .one_or_none()
    )
    if row is None:
        row = SecuritySessionSetting(
            id=1,
            inactivity_timeout_minutes=get_inactivity_timeout_minutes(db),
            updated_by="system",
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _user_me(user: User) -> UserMeOut:
    return UserMeOut(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
    )


@router.get("/me", response_model=UserMeOut)
def me(user: User = Depends(get_current_user)) -> UserMeOut:
    return _user_me(user)


@router.get("/me/", response_model=UserMeOut, include_in_schema=False)
def me_slash(user: User = Depends(get_current_user)) -> UserMeOut:
    return _user_me(user)


@router.get("/my-permissions", response_model=MyPermissionsOut)
def my_permissions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyPermissionsOut:
    perms = sorted(_get_permissions_for_role(db, user.role))
    return MyPermissionsOut(role=user.role, permissions=perms)


@router.get("/my-permissions/", response_model=MyPermissionsOut, include_in_schema=False)
def my_permissions_slash(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MyPermissionsOut:
    perms = sorted(_get_permissions_for_role(db, user.role))
    return MyPermissionsOut(role=user.role, permissions=perms)
