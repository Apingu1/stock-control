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
)
from ..schemas import (
    MaterialCreate,
    MaterialOut,
    MaterialUpdate,
    ApprovedManufacturerCreate,
    ApprovedManufacturerOut,
)

router = APIRouter(prefix="/materials", tags=["materials"])


# ---------------------------------------------------------------------------
# INTERNAL HELPERS
# ---------------------------------------------------------------------------

def _translate_integrity_error(e: IntegrityError) -> None:
    """
    Turns DB constraint errors into clean HTTP 400 messages.
    """
    msg = str(e.orig) if e.orig else str(e)

    # Duplicate material_code
    if "materials_material_code_key" in msg or "materials_pkey" in msg:
        raise HTTPException(
            status_code=400,
            detail="Material code already exists. Please choose a different code.",
        )

    # Foreign key violations (lookup mismatch)
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

    # Fallback
    raise HTTPException(
        status_code=400,
        detail=f"Invalid material data (DB constraint failed): {msg}",
    )


def _ensure_lookup_exists(
    db: Session,
    model,
    code: str,
    kind: str,
) -> None:
    """
    Pre-check that the given lookup code exists, so we can return a clean 400
    instead of letting the FK constraint cause a 500.
    """
    if not code:
        raise HTTPException(
            status_code=400,
            detail=f"{kind} code is required.",
        )

    row = db.execute(select(model).where(model.code == code)).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=400,
            detail=f"{kind} code '{code}' is not configured in the lookup table.",
        )


# ---------------------------------------------------------------------------
# CREATE MATERIAL
# ---------------------------------------------------------------------------

@router.post("/", response_model=MaterialOut, status_code=201)
def create_material(body: MaterialCreate, db: Session = Depends(get_db)):
    """
    Create a new material master record.
    Enforces uniqueness on material_code.
    """

    # 1) Enforce unique material_code
    existing = db.execute(
        select(Material).where(Material.material_code == body.material_code)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Material with code {body.material_code} already exists",
        )

    # 2) Validate lookups before insert
    _ensure_lookup_exists(db, MaterialCategory, body.category_code, "Category")
    _ensure_lookup_exists(db, MaterialType, body.type_code, "Type")
    _ensure_lookup_exists(db, Uom, body.base_uom_code, "UOM")

    # 3) Create
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
        created_by=body.created_by,
    )

    db.add(m)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        _translate_integrity_error(e)

    db.refresh(m)
    return m


# ---------------------------------------------------------------------------
# LIST MATERIALS
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[MaterialOut])
def list_materials(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(
        None,
        description="Search by material_code or name (ILIKE %search%) "
        "for type-ahead dropdowns.",
    ),
    limit: int = Query(
        200,
        ge=1,
        le=2000,
        description="Max number of materials to return (for UI lists).",
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Offset for simple pagination (0-based).",
    ),
):
    """
    List materials (optionally filtered by a case-insensitive search string).
    """
    stmt = select(Material)

    if search:
        ilike = f"%{search}%"
        stmt = stmt.where(
            (Material.material_code.ilike(ilike)) |
            (Material.name.ilike(ilike))
        )

    stmt = stmt.order_by(Material.material_code).offset(offset).limit(limit)

    rows = db.execute(stmt).scalars().all()
    return rows


# ---------------------------------------------------------------------------
# GET MATERIAL
# ---------------------------------------------------------------------------

@router.get("/{material_code}", response_model=MaterialOut)
def get_material(material_code: str, db: Session = Depends(get_db)):
    """
    Get a single material by its material_code.
    """
    m = db.execute(
        select(Material).where(Material.material_code == material_code)
    ).scalar_one_or_none()

    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    return m


# ---------------------------------------------------------------------------
# UPDATE MATERIAL
# ---------------------------------------------------------------------------

@router.put("/{material_code}", response_model=MaterialOut)
def update_material(
    material_code: str,
    body: MaterialUpdate,
    db: Session = Depends(get_db),
):
    """
    Update an existing material's master data.
    """
    m = db.execute(
        select(Material).where(Material.material_code == material_code)
    ).scalar_one_or_none()

    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    # Validate updated lookups
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


# ---------------------------------------------------------------------------
# APPROVED MANUFACTURERS
# ---------------------------------------------------------------------------

@router.get(
    "/{material_code}/approved-manufacturers",
    response_model=List[ApprovedManufacturerOut],
)
def list_approved_manufacturers(
    material_code: str,
    db: Session = Depends(get_db),
) -> List[ApprovedManufacturerOut]:

    m = db.execute(
        select(Material).where(Material.material_code == material_code)
    ).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    return [
        ApprovedManufacturerOut.model_validate(am)
        for am in m.approved_manufacturers
    ]


@router.post(
    "/{material_code}/approved-manufacturers",
    response_model=ApprovedManufacturerOut,
    status_code=201,
)
def add_approved_manufacturer(
    material_code: str,
    body: ApprovedManufacturerCreate,
    db: Session = Depends(get_db),
) -> ApprovedManufacturerOut:

    m = db.execute(
        select(Material).where(Material.material_code == material_code)
    ).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    manufacturer_name = body.manufacturer_name.strip()
    if not manufacturer_name:
        raise HTTPException(
            status_code=400,
            detail="Manufacturer name is required",
        )

    # Duplicate check (case-insensitive)
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
def delete_approved_manufacturer(
    material_code: str,
    am_id: int,
    db: Session = Depends(get_db),
) -> None:

    m = db.execute(
        select(Material).where(Material.material_code == material_code)
    ).scalar_one_or_none()
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
        raise HTTPException(
            status_code=404,
            detail="Approved manufacturer not found",
        )

    db.delete(am)
    db.commit()
