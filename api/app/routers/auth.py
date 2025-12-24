# app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas import LoginRequest, TokenOut, UserMeOut
from ..security import verify_password, create_access_token, get_current_user

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
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenOut:
    return _login_impl(payload, db)


# Accept trailing slash too, WITHOUT redirect (prevents Codespaces weird host redirects)
@router.post("/login/", response_model=TokenOut, include_in_schema=False)
def login_slash(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenOut:
    return _login_impl(payload, db)


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
