# app/routers/admin.py
from typing import List, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User, Role, Permission, RolePermission
from ..schemas import (
    UserCreate,
    UserOut,
    UserUpdate,
    RoleOut,
    RoleCreate,
    RoleUpdate,
    PermissionOut,
    RolePermissionOut,
    RolePermissionSet,
)
from ..security import hash_password, require_admin_access

router = APIRouter(prefix="/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users", response_model=List[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> List[UserOut]:
    return db.query(User).order_by(User.username.asc()).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_access),
) -> UserOut:
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")

    existing = db.query(User).filter(User.username == username).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="username already exists")

    role_name = (payload.role or "").strip().upper()
    if not role_name:
        raise HTTPException(status_code=400, detail="role is required")

    role = db.query(Role).filter(Role.name == role_name).one_or_none()
    if role is None:
        raise HTTPException(status_code=400, detail="Invalid role (does not exist)")
    if not role.is_active:
        raise HTTPException(status_code=400, detail="Role is inactive")

    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="password must be at least 6 chars")

    u = User(
        username=username,
        password_hash=hash_password(payload.password),
        role=role_name,
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
    _: User = Depends(require_admin_access),
) -> UserOut:
    u = db.query(User).filter(User.id == user_id).one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role is not None:
        role_name = payload.role.strip().upper()
        role = db.query(Role).filter(Role.name == role_name).one_or_none()
        if role is None:
            raise HTTPException(status_code=400, detail="Invalid role (does not exist)")
        if not role.is_active:
            raise HTTPException(status_code=400, detail="Role is inactive")
        u.role = role_name

    if payload.is_active is not None:
        u.is_active = bool(payload.is_active)

    # Password management (admin)
    if payload.password is not None:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="password must be at least 6 chars")
        u.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(u)
    return u


# ---------------------------------------------------------------------------
# Roles
# ---------------------------------------------------------------------------

@router.get("/roles", response_model=List[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> List[RoleOut]:
    return db.query(Role).order_by(Role.name.asc()).all()


@router.post("/roles", response_model=RoleOut, status_code=201)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> RoleOut:
    name = payload.name.strip().upper()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")

    existing = db.query(Role).filter(Role.name == name).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Role already exists")

    r = Role(
        name=name,
        description=payload.description,
        is_active=bool(payload.is_active),
    )
    db.add(r)

    # Create default entries in role_permissions for all permissions as FALSE (granted = False)
    perms = db.query(Permission).all()
    for p in perms:
        db.add(RolePermission(role_name=name, permission_key=p.key, granted=False))

    db.commit()
    db.refresh(r)
    return r


@router.patch("/roles/{role_name}", response_model=RoleOut)
def update_role(
    role_name: str,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> RoleOut:
    rn = role_name.strip().upper()
    r = db.query(Role).filter(Role.name == rn).one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Role not found")

    if payload.description is not None:
        r.description = payload.description

    if payload.is_active is not None:
        r.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(r)
    return r


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

@router.get("/permissions", response_model=List[PermissionOut])
def list_permissions(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> List[PermissionOut]:
    # Your DB schema uses permissions.key + permissions.description
    return db.query(Permission).order_by(Permission.key.asc()).all()


@router.get("/roles/{role_name}/permissions", response_model=List[RolePermissionOut])
def get_role_permissions_matrix(
    role_name: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> List[RolePermissionOut]:
    rn = role_name.strip().upper()
    r = db.query(Role).filter(Role.name == rn).one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Role not found")

    # Ensure we return ALL permissions (even if missing rows) for a stable UI matrix
    perms = db.query(Permission).order_by(Permission.key.asc()).all()
    rp_rows = db.query(RolePermission).filter(RolePermission.role_name == rn).all()
    rp_map: Dict[str, bool] = {rp.permission_key: bool(rp.granted) for rp in rp_rows}

    out: List[RolePermissionOut] = []
    for p in perms:
        out.append(RolePermissionOut(permission_key=p.key, granted=rp_map.get(p.key, False)))
    return out


@router.put("/roles/{role_name}/permissions", response_model=List[RolePermissionOut])
def set_role_permissions_matrix(
    role_name: str,
    payload: RolePermissionSet,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> List[RolePermissionOut]:
    rn = role_name.strip().upper()
    r = db.query(Role).filter(Role.name == rn).one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Role not found")

    # Validate and map incoming toggles
    if not payload.permissions:
        raise HTTPException(status_code=400, detail="No permissions provided")

    valid = {p.key for p in db.query(Permission).all()}

    incoming: Dict[str, bool] = {}
    for item in payload.permissions:
        k = (item.permission_key or "").strip()
        if not k:
            continue
        if k not in valid:
            raise HTTPException(status_code=400, detail=f"Unknown permission: {k}")
        incoming[k] = bool(item.granted)

    if not incoming:
        raise HTTPException(status_code=400, detail="No valid permissions provided")

    for k, granted in incoming.items():
        rp = (
            db.query(RolePermission)
            .filter(RolePermission.role_name == rn)
            .filter(RolePermission.permission_key == k)
            .one_or_none()
        )
        if rp is None:
            db.add(RolePermission(role_name=rn, permission_key=k, granted=granted))
        else:
            rp.granted = granted

    db.commit()
    return get_role_permissions_matrix(rn, db, _)
