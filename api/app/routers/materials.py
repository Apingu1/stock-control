# app/routers/materials.py
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Material,
    MaterialCategory,
    MaterialType,
    Uom,
    MaterialEdit,
    MaterialApprovedManufacturer,
    User,
)
from ..schemas import (
    MaterialCreate,
    MaterialUpdate,
    MaterialOut,
    ApprovedManufacturerOut,
    ApprovedManufacturerCreate,
)
from ..security import require_permission
from ..audit_logger import log_approved_manufacturer_edit

router = APIRouter(prefix="/materials", tags=["materials"])


def _ensure_lookup_exists(db: Session, model, key: str, label: str) -> None:
    row = db.execute(select(model).where(model.code == key)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=400, detail=f"{label} code '{key}' does not exist")


def _translate_integrity_error(e: IntegrityError):
    msg = str(e.orig).lower() if e.orig else str(e).lower()
    if "unique" in msg or "duplicate" in msg:
        raise HTTPException(status_code=409, detail="Duplicate record (unique constraint hit)")
    raise HTTPException(status_code=400, detail="Database integrity error")


@router.post("/", response_model=MaterialOut, status_code=201)
def create_material(
    body: MaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("materials.create")),
):
    _ensure_lookup_exists(db, MaterialCategory, body.category_code, "Category")
    _ensure_lookup_exists(db, MaterialType, body.type_code, "Type")
    _ensure_lookup_exists(db, Uom, body.base_uom_code, "UOM")

    m = Material(
        material_code=body.material_code.strip(),
        name=body.name.strip(),
        category_code=body.category_code.strip(),
        type_code=body.type_code.strip(),
        base_uom_code=body.base_uom_code.strip(),
        manufacturer=body.manufacturer,
        supplier=body.supplier,
        complies_es_criteria=body.complies_es_criteria,
        status=body.status,
        created_by=user.username,  # ✅ enforce from JWT
    )

    db.add(m)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        _translate_integrity_error(e)

    db.refresh(m)
    return m


@router.get("/", response_model=List[MaterialOut])
def list_materials(
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("materials.view")),
    search: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    stmt = select(Material)

    if search:
        ilike = f"%{search}%"
        stmt = stmt.where((Material.material_code.ilike(ilike)) | (Material.name.ilike(ilike)))

    stmt = stmt.order_by(Material.material_code).offset(offset).limit(limit)
    return db.execute(stmt).scalars().all()


@router.get("/{material_code}", response_model=MaterialOut)
def get_material(
    material_code: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("materials.view")),
):
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    return m


@router.put("/{material_code}", response_model=MaterialOut)
def update_material(
    material_code: str,
    body: MaterialUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("materials.edit")),
):
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    _ensure_lookup_exists(db, MaterialCategory, body.category_code, "Category")
    _ensure_lookup_exists(db, MaterialType, body.type_code, "Type")
    _ensure_lookup_exists(db, Uom, body.base_uom_code, "UOM")

    reason = (body.edit_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="edit_reason is required for material edits")

    if body.name != m.name:
        raise HTTPException(
            status_code=400,
            detail=(
                "Material name cannot be changed once created. "
                "If a rename is required, create a new material record."
            ),
        )

    before_json = MaterialEdit.snapshot_material(m)

    m.name = body.name
    m.category_code = body.category_code
    m.type_code = body.type_code
    m.base_uom_code = body.base_uom_code
    m.manufacturer = body.manufacturer
    m.supplier = body.supplier
    m.complies_es_criteria = body.complies_es_criteria
    m.status = body.status

    after_json = MaterialEdit.snapshot_material(m)

    db.add(
        MaterialEdit(
            material_id=m.id,
            edited_by=user.username,
            edit_reason=reason,
            before_json=before_json,
            after_json=after_json,
        )
    )

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        _translate_integrity_error(e)

    db.refresh(m)
    return m


@router.get(
    "/{material_code}/approved-manufacturers",
    response_model=List[ApprovedManufacturerOut],
)
def list_approved_manufacturers(
    material_code: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("materials.view")),
) -> List[ApprovedManufacturerOut]:
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    # ✅ Return active only (operational list)
    active = [am for am in m.approved_manufacturers if am.is_active]
    return [ApprovedManufacturerOut.model_validate(am) for am in active]


@router.post(
    "/{material_code}/approved-manufacturers",
    response_model=ApprovedManufacturerOut,
    status_code=201,
)
def add_approved_manufacturer(
    material_code: str,
    body: ApprovedManufacturerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("materials.edit")),
):
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    reason = (body.edit_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="edit_reason is required")

    manufacturer_name = (body.manufacturer_name or "").strip()
    if not manufacturer_name:
        raise HTTPException(status_code=400, detail="Manufacturer name is required")

    existing = (
        db.query(MaterialApprovedManufacturer)
        .filter(
            MaterialApprovedManufacturer.material_id == m.id,
            MaterialApprovedManufacturer.manufacturer_name.ilike(manufacturer_name),
        )
        .one_or_none()
    )
    if existing:
        # If it exists but inactive, re-activate (audited)
        if not existing.is_active:
            before = {
                "id": existing.id,
                "material_code": m.material_code,
                "manufacturer_name": existing.manufacturer_name,
                "is_active": existing.is_active,
            }
            existing.is_active = True
            after = {
                "id": existing.id,
                "material_code": m.material_code,
                "manufacturer_name": existing.manufacturer_name,
                "is_active": existing.is_active,
            }

            log_approved_manufacturer_edit(
                db,
                edited_by=user.username,
                material_code=m.material_code,
                action="ADD",
                manufacturer_name=existing.manufacturer_name,
                edit_reason=reason,
                before_json=before,
                after_json=after,
            )
            db.commit()
            db.refresh(existing)
            return ApprovedManufacturerOut.model_validate(existing)

        raise HTTPException(
            status_code=409,
            detail=f"Manufacturer '{manufacturer_name}' already exists for this material",
        )

    am = MaterialApprovedManufacturer(
        material_id=m.id,
        manufacturer_name=manufacturer_name,
        is_active=True,
        created_by=user.username,  # ✅ enforce from JWT
    )

    db.add(am)
    db.flush()

    after = {
        "id": am.id,
        "material_code": m.material_code,
        "manufacturer_name": am.manufacturer_name,
        "is_active": am.is_active,
    }

    log_approved_manufacturer_edit(
        db,
        edited_by=user.username,
        material_code=m.material_code,
        action="ADD",
        manufacturer_name=manufacturer_name,
        edit_reason=reason,
        before_json=None,
        after_json=after,
    )

    db.commit()
    db.refresh(am)
    return ApprovedManufacturerOut.model_validate(am)


@router.delete(
    "/{material_code}/approved-manufacturers/{am_id}",
    status_code=204,
)
def delete_approved_manufacturer(
    material_code: str,
    am_id: int,
    edit_reason: str = Query(..., description="Mandatory GMP reason for removal"),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("materials.edit")),
) -> None:
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    reason = (edit_reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="edit_reason is required")

    am = (
        db.query(MaterialApprovedManufacturer)
        .filter(
            MaterialApprovedManufacturer.id == am_id,
            MaterialApprovedManufacturer.material_id == m.id,
        )
        .one_or_none()
    )
    if not am or not am.is_active:
        raise HTTPException(status_code=404, detail="Approved manufacturer not found")

    before = {
        "id": am.id,
        "material_code": m.material_code,
        "manufacturer_name": am.manufacturer_name,
        "is_active": am.is_active,
    }

    # ✅ Soft remove (deactivate) for traceability
    am.is_active = False

    after = {
        "id": am.id,
        "material_code": m.material_code,
        "manufacturer_name": am.manufacturer_name,
        "is_active": am.is_active,
    }

    log_approved_manufacturer_edit(
        db,
        edited_by=user.username,
        material_code=m.material_code,
        action="REMOVE",
        manufacturer_name=am.manufacturer_name,
        edit_reason=reason,
        before_json=before,
        after_json=after,
    )

    db.commit()
    return None
