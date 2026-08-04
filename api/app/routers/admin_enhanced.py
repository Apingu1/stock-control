from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Permission, User
from ..schemas import RolePermissionsOut, RolePermissionsUpdate
from ..security import require_admin_full
from . import admin as legacy_admin


router = APIRouter(prefix="/admin", tags=["admin"])


def _all_permission_keys(db: Session) -> list[str]:
    return [
        row[0]
        for row in db.query(Permission.key).order_by(Permission.key.asc()).all()
    ]


@router.get("/roles/{role_name}/permissions", response_model=RolePermissionsOut)
def get_role_permissions_with_admin_invariant(
    role_name: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_full),
) -> RolePermissionsOut:
    role = role_name.strip().upper()
    if role != "ADMIN":
        return legacy_admin.get_role_permissions(role_name=role, db=db, _=user)

    # Route through the mature updater so missing/false matrix rows are repaired,
    # audited and displayed consistently. A fixed system reason is used only
    # when repair is actually necessary.
    all_keys = _all_permission_keys(db)
    current = legacy_admin.get_role_permissions(role_name=role, db=db, _=user)
    if set(current.granted_permissions) != set(all_keys):
        repair = RolePermissionsUpdate(
            granted_permissions=all_keys,
            reason="Automatic ADMIN permission invariant repair",
        )
        current = legacy_admin.set_role_permissions(
            role_name=role,
            body=repair,
            db=db,
            user=user,
        )
    return RolePermissionsOut(role_name="ADMIN", granted_permissions=all_keys)


@router.put("/roles/{role_name}/permissions", response_model=RolePermissionsOut)
def set_role_permissions_with_admin_invariant(
    role_name: str,
    body: RolePermissionsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin_full),
) -> RolePermissionsOut:
    role = role_name.strip().upper()
    if role != "ADMIN":
        return legacy_admin.set_role_permissions(
            role_name=role,
            body=body,
            db=db,
            user=user,
        )

    # ADMIN is the non-retirable system owner role. Even when a UI/client sends
    # a partial set, persist every registered permission as granted. The caller's
    # reason remains part of the audit trail.
    forced = RolePermissionsUpdate(
        granted_permissions=_all_permission_keys(db),
        reason=body.reason,
    )
    return legacy_admin.set_role_permissions(
        role_name="ADMIN",
        body=forced,
        db=db,
        user=user,
    )
