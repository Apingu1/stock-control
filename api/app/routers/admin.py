# app/routers/admin.py
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas import UserCreate, UserOut, UserUpdate
from ..security import hash_password, require_admin, get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> List[UserOut]:
    return db.query(User).order_by(User.username.asc()).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserOut:
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    existing = db.query(User).filter(User.username == username).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="username already exists")

    role = (payload.role or "OPERATOR").strip().upper()
    if role not in {"OPERATOR", "SENIOR", "ADMIN"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="password must be at least 6 chars")

    u = User(
        username=username,
        password_hash=hash_password(payload.password),
        role=role,
        is_active=bool(payload.is_active),
        created_by=admin.username,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> UserOut:
    u = db.query(User).filter(User.id == user_id).one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None:
        role = payload.role.strip().upper()
        if role not in {"OPERATOR", "SENIOR", "ADMIN"}:
            raise HTTPException(status_code=400, detail="Invalid role")
        u.role = role

    if payload.is_active is not None:
        u.is_active = bool(payload.is_active)

    if payload.password is not None:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="password must be at least 6 chars")
        u.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(u)
    return u
