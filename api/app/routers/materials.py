from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material
from ..schemas import MaterialCreate, MaterialOut

router = APIRouter(prefix="/materials", tags=["materials"])


@router.post("/", response_model=MaterialOut, status_code=201)
def create_material(body: MaterialCreate, db: Session = Depends(get_db)):
    # Enforce unique material_code
    existing = db.execute(
        select(Material).where(Material.material_code == body.material_code)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Material with code {body.material_code} already exists",
        )

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
    db.commit()
    db.refresh(m)
    return m


@router.get("/", response_model=List[MaterialOut])
def list_materials(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(
        None, description="Search by code or name (ILIKE %search%)"
    ),
    limit: int = Query(100, ge=1, le=500),
):
    stmt = select(Material)

    if search:
        ilike = f"%{search}%"
        stmt = stmt.where(
            (Material.material_code.ilike(ilike)) | (Material.name.ilike(ilike))
        )

    stmt = stmt.order_by(Material.material_code).limit(limit)
    rows = db.execute(stmt).scalars().all()
    return rows


@router.get("/{material_code}", response_model=MaterialOut)
def get_material(material_code: str, db: Session = Depends(get_db)):
    m = db.execute(
        select(Material).where(Material.material_code == material_code)
    ).scalar_one_or_none()

    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    return m
