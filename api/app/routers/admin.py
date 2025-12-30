# app/routers/admin.py
from typing import List, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

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
# Safety helpers
# ---------------------------------------------------------------------------

SYSTEM_ROLES = {"ADMIN", "SENIOR", "OPERATOR"}
PROTECTED_ADMIN_USERNAME = "admin"


def _active_admin_count(db: Session) -> int:
    return (
        db.query(func.count(User.id))
        .filter(User.role == "ADMIN", User.is_active.is_(True))
        .scalar()
        or 0
    )


def _is_demoting_or_disabling_admin(u: User, payload: UserUpdate) -> bool:
    """
    True if the change would cause this user to stop being an ACTIVE ADMIN.
    """
    current_is_admin = (u.role or "").upper() == "ADMIN"
    current_active = bool(u.is_active)

    new_role = (payload.role.strip().upper() if payload.role is not None else (u.role or "").upper())
    new_active = (bool(payload.is_active) if payload.is_active is not None else current_active)

    # If they end up not ADMIN, or inactive, then they are not an active admin.
    return current_is_admin and current_active and (new_role != "ADMIN" or not new_active)


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

    # -----------------------------------------------------------------------
    # HARD SAFETY: the built-in 'admin' account can NEVER be disabled or demoted
    # -----------------------------------------------------------------------
    if u.username == PROTECTED_ADMIN_USERNAME:
        if payload.is_active is not None and payload.is_active is False:
            raise HTTPException(status_code=400, detail="The 'admin' user cannot be made inactive")
        if payload.role is not None and payload.role.strip().upper() != "ADMIN":
            raise HTTPException(status_code=400, detail="The 'admin' user role cannot be changed")

    # -----------------------------------------------------------------------
    # SAFETY: never allow the system to end up with 0 active ADMIN users
    # (blocks disabling/demoting the last active admin)
    # -----------------------------------------------------------------------
    if _is_demoting_or_disabling_admin(u, payload):
        active_admins = _active_admin_count(db)
        # since this user is currently an active admin, removing them would reduce by 1
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="Cannot disable/demote the last active ADMIN user")

    # Role change
    if payload.role is not None:
        role_name = payload.role.strip().upper()
        role = db.query(Role).filter(Role.name == role_name).one_or_none()
        if role is None:
            raise HTTPException(status_code=400, detail="Invalid role (does not exist)")
        if not role.is_active:
            raise HTTPException(status_code=400, detail="Role is inactive")
        u.role = role_name

    # Active flag
    if payload.is_active is not None:
        u.is_active = bool(payload.is_active)

    # Password reset (admin)
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

    # Default role_permissions rows for all permissions set FALSE
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

    # safety: don’t allow system roles to be deactivated
    if rn in SYSTEM_ROLES and payload.is_active is not None and payload.is_active is False:
        raise HTTPException(status_code=400, detail="System roles cannot be deactivated")

    if payload.description is not None:
        r.description = payload.description

    if payload.is_active is not None:
        r.is_active = bool(payload.is_active)

    db.commit()
    db.refresh(r)
    return r


@router.delete("/roles/{role_name}", status_code=204)
def delete_role(
    role_name: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
):
    rn = role_name.strip().upper()

    # never allow deleting core roles
    if rn in SYSTEM_ROLES:
        raise HTTPException(status_code=400, detail="Cannot delete system role")

    role = db.query(Role).filter(Role.name == rn).one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")

    # Block delete if any users currently have this role
    user_count = db.query(func.count(User.id)).filter(User.role == rn).scalar() or 0
    if user_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete role '{rn}' because {user_count} user(s) are assigned to it. Reassign users first.",
        )

    # Safe to delete: cascades role_permissions via FK ON DELETE CASCADE
    db.delete(role)
    db.commit()
    return


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

@router.get("/permissions", response_model=List[PermissionOut])
def list_permissions(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_access),
) -> List[PermissionOut]:
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

    # Return ALL permissions for stable matrix (even if missing rows)
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
    admin: User = Depends(require_admin_access),
) -> List[RolePermissionOut]:
    rn = role_name.strip().upper()
    r = db.query(Role).filter(Role.name == rn).one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Role not found")

# Role name is authoritative from the path param {rn}.
# Payload may not include role_name (frontend sends only permissions list).
# We deliberately do not accept role_name from client to avoid mismatches.


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
    return get_role_permissions_matrix(rn, db, admin)