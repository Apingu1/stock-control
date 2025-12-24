# app/routers/materials.py
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
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
from ..schemas import (
    MaterialCreate,
    MaterialOut,
    MaterialUpdate,
    ApprovedManufacturerCreate,
    ApprovedManufacturerOut,
)
from ..security import get_current_user

router = APIRouter(prefix="/materials", tags=["materials"])


def _translate_integrity_error(e: IntegrityError) -> None:
    msg = str(e.orig) if e.orig else str(e)

    if "materials_material_code_key" in msg or "materials_pkey" in msg:
        raise HTTPException(
            status_code=400,
            detail="Material code already exists. Please choose a different code.",
        )

    if "materials_category_code_fkey" in msg:
        raise HTTPException(
            status_code=400,
            detail="Invalid category_code. Must match an entry in material_categories.",
        )
    if "materials_type_code_fkey" in msg:
        raise HTTPException(
            status_code=400,
            detail="Invalid type_code. Must match an entry in material_types.",
        )
    if "materials_base_uom_code_fkey" in msg:
        raise HTTPException(
            status_code=400,
            detail="Invalid base_uom_code. Must match an entry in uoms.",
        )

    raise HTTPException(
        status_code=400,
        detail=f"Invalid material data (DB constraint failed): {msg}",
    )


def _ensure_lookup_exists(db: Session, model, code: str, kind: str) -> None:
    if not code:
        raise HTTPException(status_code=400, detail=f"{kind} code is required.")

    row = db.execute(select(model).where(model.code == code)).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=400,
            detail=f"{kind} code '{code}' is not configured in the lookup table.",
        )


@router.post("/", response_model=MaterialOut, status_code=201)
def create_material(
    body: MaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    created_by = user.username

    existing = db.execute(
        select(Material).where(Material.material_code == body.material_code)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Material with code {body.material_code} already exists",
        )

    _ensure_lookup_exists(db, MaterialCategory, body.category_code, "Category")
    _ensure_lookup_exists(db, MaterialType, body.type_code, "Type")
    _ensure_lookup_exists(db, Uom, body.base_uom_code, "UOM")

    m = Material(
        material_code=body.material_code,
        name=body.name,
        category_code=body.category_code,
        type_code=body.type_code,
        base_uom_code=body.base_uom_code,
        manufacturer=body.manufacturer,
        supplier=body.supplier,
        complies_es_criteria=body.complies_es_criteria,
        status=body.status,
        created_by=created_by,
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
    search: Optional[str] = Query(None, description="Search by material_code or name"),
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
def get_material(material_code: str, db: Session = Depends(get_db)):
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    return m


@router.put("/{material_code}", response_model=MaterialOut)
def update_material(
    material_code: str,
    body: MaterialUpdate,
    db: Session = Depends(get_db),
):
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    _ensure_lookup_exists(db, MaterialCategory, body.category_code, "Category")
    _ensure_lookup_exists(db, MaterialType, body.type_code, "Type")
    _ensure_lookup_exists(db, Uom, body.base_uom_code, "UOM")

    m.name = body.name
    m.category_code = body.category_code
    m.type_code = body.type_code
    m.base_uom_code = body.base_uom_code
    m.manufacturer = body.manufacturer
    m.supplier = body.supplier
    m.complies_es_criteria = body.complies_es_criteria
    m.status = body.status

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
def list_approved_manufacturers(material_code: str, db: Session = Depends(get_db)) -> List[ApprovedManufacturerOut]:
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    return [ApprovedManufacturerOut.model_validate(am) for am in m.approved_manufacturers]


@router.post(
    "/{material_code}/approved-manufacturers",
    response_model=ApprovedManufacturerOut,
    status_code=201,
)
def add_approved_manufacturer(
    material_code: str,
    body: ApprovedManufacturerCreate,
    db: Session = Depends(get_db),
):
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    manufacturer_name = body.manufacturer_name.strip()
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
        raise HTTPException(
            status_code=409,
            detail=f"Manufacturer '{manufacturer_name}' already exists for this material",
        )

    am = MaterialApprovedManufacturer(
        material_id=m.id,
        manufacturer_name=manufacturer_name,
        is_active=body.is_active,
        created_by=body.created_by,
    )

    db.add(am)
    db.commit()
    db.refresh(am)

    return ApprovedManufacturerOut.model_validate(am)


@router.delete(
    "/{material_code}/approved-manufacturers/{am_id}",
    status_code=204,
)
def delete_approved_manufacturer(material_code: str, am_id: int, db: Session = Depends(get_db)) -> None:
    m = db.execute(select(Material).where(Material.material_code == material_code)).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    am = (
        db.query(MaterialApprovedManufacturer)
        .filter(
            MaterialApprovedManufacturer.id == am_id,
            MaterialApprovedManufacturer.material_id == m.id,
        )
        .one_or_none()
    )
    if not am:
        raise HTTPException(status_code=404, detail="Approved manufacturer not found")

    db.delete(am)
    db.commit()
