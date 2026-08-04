from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Material,
    MaterialApprovedManufacturer,
    MaterialCategory,
    MaterialType,
    Uom,
    User,
)
from ..schemas import MaterialCreate, MaterialOut
from ..security import require_permission


router = APIRouter(prefix="/materials", tags=["materials"])


class AutoMaterialCreate(MaterialCreate):
    """Material create payload with a server-controlled material code."""

    material_code: Optional[str] = Field(
        default=None,
        description="Ignored on create. The server assigns MAT0001, MAT0002, etc.",
    )


def _ensure_lookup_exists(db: Session, model, key: str, label: str) -> None:
    row = db.execute(select(model).where(model.code == key)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=400, detail=f"{label} code '{key}' does not exist")


def _format_material_code(number: int) -> str:
    return f"MAT{number:04d}"


def _allocate_material_code(db: Session) -> str:
    """Allocate a unique server-side code. Sequence gaps are acceptable and auditable."""
    for _ in range(25):
        number = db.execute(text("SELECT nextval('material_code_seq')")).scalar_one()
        candidate = _format_material_code(int(number))
        exists = db.query(Material.id).filter(Material.material_code == candidate).first()
        if not exists:
            return candidate
    raise HTTPException(status_code=500, detail="Unable to allocate a unique material code")


@router.get("/next-code")
def preview_next_material_code(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("materials.view")),
):
    """Return a non-reserving preview for the create modal."""
    row = db.execute(
        text(
            """
            SELECT CASE
              WHEN is_called THEN last_value + 1
              ELSE last_value
            END AS next_number
            FROM material_code_seq
            """
        )
    ).mappings().one()
    return {"material_code": _format_material_code(int(row["next_number"]))}


@router.post("/", response_model=MaterialOut, status_code=201)
def create_material_with_automatic_code(
    body: AutoMaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("materials.create")),
):
    _ensure_lookup_exists(db, MaterialCategory, body.category_code, "Category")
    _ensure_lookup_exists(db, MaterialType, body.type_code, "Type")
    _ensure_lookup_exists(db, Uom, body.base_uom_code, "UOM")

    material_name = body.name.strip()
    if not material_name:
        raise HTTPException(status_code=400, detail="Material name is required")

    material_code = _allocate_material_code(db)
    material = Material(
        material_code=material_code,
        name=material_name,
        category_code=body.category_code.strip(),
        type_code=body.type_code.strip(),
        base_uom_code=body.base_uom_code.strip(),
        manufacturer=body.manufacturer,
        supplier=body.supplier,
        complies_es_criteria=body.complies_es_criteria,
        status=body.status,
        created_by=user.username,
        low_stock_threshold_qty=body.low_stock_threshold_qty,
        expiry_alert_days=body.expiry_alert_days,
        auto_quarantine_override_days=body.auto_quarantine_override_days,
        is_cancelled_bmr_marker=False,
    )

    db.add(material)
    try:
        db.flush()

        # Preserve the existing approved-manufacturer convenience behaviour.
        if material.category_code == "TABLETS_CAPSULES" and material.manufacturer:
            db.add(
                MaterialApprovedManufacturer(
                    material_id=material.id,
                    manufacturer_name=material.manufacturer,
                    is_active=True,
                    created_by=user.username,
                )
            )

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        message = str(exc.orig or exc).lower()
        if "unique" in message or "duplicate" in message:
            raise HTTPException(status_code=409, detail="Duplicate material record") from exc
        raise HTTPException(status_code=400, detail="Database integrity error") from exc

    db.refresh(material)
    return material
