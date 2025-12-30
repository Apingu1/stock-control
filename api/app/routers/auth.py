# app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas import LoginRequest, TokenOut, UserMeOut, MyPermissionsOut
from ..security import verify_password, create_access_token, get_current_user
from ..security import _get_permissions_for_role  # internal helper from security.py
from ..audit_logger import log_security_event

router = APIRouter(prefix="/auth", tags=["auth"])


def _login_impl(payload: LoginRequest, db: Session) -> TokenOut:
    user = db.query(User).filter(User.username == payload.username).one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(sub=user.username, role=user.role)
    return TokenOut(access_token=token, token_type="bearer")


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenOut:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    try:
        tok = _login_impl(payload, db)
        # success: we can resolve role from token payload input username
        user = db.query(User).filter(User.username == payload.username).one_or_none()
        log_security_event(
            db,
            event_type="LOGIN_SUCCESS",
            actor_username=payload.username,
            actor_role=(user.role if user else None),
            target_type="AUTH",
            target_ref=payload.username,
            success=True,
            ip_address=ip,
            user_agent=ua,
        )
        db.commit()
        return tok
    except HTTPException:
        log_security_event(
            db,
            event_type="LOGIN_FAIL",
            actor_username=payload.username,
            target_type="AUTH",
            target_ref=payload.username,
            success=False,
            ip_address=ip,
            user_agent=ua,
        )
        db.commit()
        raise


@router.post("/login/", response_model=TokenOut, include_in_schema=False)
def login_slash(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenOut:
    return login(payload, request, db)


@router.get("/me", response_model=UserMeOut)
def me(user: User = Depends(get_current_user)) -> UserMeOut:
    return UserMeOut(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
    )


@router.get("/me/", response_model=UserMeOut, include_in_schema=False)
def me_slash(user: User = Depends(get_current_user)) -> UserMeOut:
    return UserMeOut(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
    )


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
