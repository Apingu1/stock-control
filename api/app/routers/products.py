from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, Product, ProductAuditEvent, ProductMaterial, User
from ..schemas import ProductCreate, ProductMaterialOut, ProductOut, ProductStatusUpdate, ProductUpdate
from ..security import require_permission


router = APIRouter(prefix="/products", tags=["products"])


def _clean_required(value: str, label: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{label} is required")
    return cleaned


def _active_material_rows(db: Session, product_id: int) -> list[Material]:
    return (
        db.query(Material)
        .join(ProductMaterial, ProductMaterial.material_id == Material.id)
        .filter(
            ProductMaterial.product_id == product_id,
            ProductMaterial.is_active.is_(True),
        )
        .order_by(Material.material_code.asc())
        .all()
    )


def _snapshot(db: Session, product: Product) -> dict:
    materials = _active_material_rows(db, product.id)
    return {
        "id": product.id,
        "product_code": product.product_code,
        "product_name": product.product_name,
        "reference": product.reference,
        "version_number": product.version_number,
        "shelf_life_days": product.shelf_life_days,
        "licence_status": product.licence_status,
        "line_type": product.line_type,
        "storage_condition": product.storage_condition,
        "controlled_drug_status": product.controlled_drug_status,
        "export_status": product.export_status,
        "status": product.status,
        "material_ids": [material.id for material in materials],
        "material_codes": [material.material_code for material in materials],
    }


def _out(db: Session, product: Product) -> ProductOut:
    materials = _active_material_rows(db, product.id)
    return ProductOut(
        id=product.id,
        product_code=product.product_code,
        product_name=product.product_name,
        reference=product.reference,
        version_number=product.version_number,
        shelf_life_days=product.shelf_life_days,
        licence_status=product.licence_status,
        line_type=product.line_type,
        storage_condition=product.storage_condition,
        controlled_drug_status=product.controlled_drug_status,
        export_status=product.export_status,
        status=product.status,
        created_at=product.created_at,
        created_by=product.created_by,
        updated_at=product.updated_at,
        updated_by=product.updated_by,
        materials=[
            ProductMaterialOut(
                id=material.id,
                material_code=material.material_code,
                material_name=material.name,
                category_code=material.category_code,
                type_code=material.type_code,
                base_uom_code=material.base_uom_code,
                status=material.status,
            )
            for material in materials
        ],
    )


def _load_materials(db: Session, material_ids: list[int]) -> list[Material]:
    unique_ids = list(dict.fromkeys(material_ids))
    materials = db.query(Material).filter(Material.id.in_(unique_ids)).all()
    found = {material.id for material in materials}
    missing = [material_id for material_id in unique_ids if material_id not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown material IDs: {missing}")

    invalid = [
        material.material_code
        for material in materials
        if material.status != "ACTIVE" or material.is_cancelled_bmr_marker
    ]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=(
                "Products may only contain active stock materials. "
                f"Remove: {', '.join(sorted(invalid))}"
            ),
        )
    return materials


def _apply_fields(product: Product, payload: ProductCreate | ProductUpdate) -> None:
    product.product_code = _clean_required(payload.product_code, "Product code").upper()
    product.product_name = _clean_required(payload.product_name, "Product name")
    product.reference = (payload.reference or "").strip()
    product.version_number = (payload.version_number or "").strip()
    product.shelf_life_days = payload.shelf_life_days
    product.licence_status = payload.licence_status
    product.line_type = payload.line_type
    product.storage_condition = payload.storage_condition
    product.controlled_drug_status = payload.controlled_drug_status
    product.export_status = payload.export_status


def _sync_materials(
    db: Session,
    product: Product,
    materials: list[Material],
    username: str,
) -> None:
    wanted_ids = {material.id for material in materials}
    existing = {
        row.material_id: row
        for row in db.query(ProductMaterial).filter(ProductMaterial.product_id == product.id).all()
    }

    for material_id, row in existing.items():
        row.is_active = material_id in wanted_ids
        row.updated_by = username

    for material_id in wanted_ids - set(existing):
        db.add(
            ProductMaterial(
                product_id=product.id,
                material_id=material_id,
                is_active=True,
                created_by=username,
                updated_by=username,
            )
        )
    db.flush()


@router.get("/", response_model=List[ProductOut])
def list_products(
    q: str | None = Query(None),
    status: str | None = Query(None),
    licence_status: str | None = Query(None),
    line_type: str | None = Query(None),
    storage_condition: str | None = Query(None),
    controlled_drug_status: str | None = Query(None),
    export_status: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("products.view")),
) -> List[ProductOut]:
    query = db.query(Product)
    if q and q.strip():
        needle = f"%{q.strip()}%"
        material_product_ids = (
            db.query(ProductMaterial.product_id)
            .join(Material, Material.id == ProductMaterial.material_id)
            .filter(
                ProductMaterial.is_active.is_(True),
                or_(Material.material_code.ilike(needle), Material.name.ilike(needle)),
            )
        )
        query = query.filter(
            or_(
                Product.product_code.ilike(needle),
                Product.product_name.ilike(needle),
                Product.reference.ilike(needle),
                Product.version_number.ilike(needle),
                Product.id.in_(material_product_ids),
            )
        )

    for column, value in (
        (Product.status, status),
        (Product.licence_status, licence_status),
        (Product.line_type, line_type),
        (Product.storage_condition, storage_condition),
        (Product.controlled_drug_status, controlled_drug_status),
        (Product.export_status, export_status),
    ):
        if value and value.strip():
            query = query.filter(column == value.strip().upper())

    return [_out(db, product) for product in query.order_by(Product.product_code.asc()).all()]


@router.post("/", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.create")),
) -> ProductOut:
    code = _clean_required(payload.product_code, "Product code").upper()
    if db.query(Product).filter(Product.product_code == code).one_or_none():
        raise HTTPException(status_code=409, detail="Product code already exists")

    materials = _load_materials(db, payload.material_ids)
    reason = _clean_required(payload.audit_reason, "Audit reason")
    product = Product(
        product_code=code,
        product_name="",
        reference="",
        version_number="",
        shelf_life_days=payload.shelf_life_days,
        licence_status=payload.licence_status,
        line_type=payload.line_type,
        storage_condition=payload.storage_condition,
        controlled_drug_status=payload.controlled_drug_status,
        export_status=payload.export_status,
        status="ACTIVE",
        created_by=user.username,
        updated_by=user.username,
    )
    _apply_fields(product, payload)
    db.add(product)
    db.flush()
    _sync_materials(db, product, materials, user.username)
    after = _snapshot(db, product)
    db.add(
        ProductAuditEvent(
            event_type="PRODUCT_CREATED",
            product_id=product.id,
            product_code=product.product_code,
            product_name=product.product_name,
            actor_username=user.username,
            reason=reason,
            before_json=None,
            after_json=after,
        )
    )
    db.commit()
    db.refresh(product)
    return _out(db, product)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.edit")),
) -> ProductOut:
    product = db.query(Product).filter(Product.id == product_id).with_for_update().one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    code = _clean_required(payload.product_code, "Product code").upper()
    conflict = db.query(Product).filter(Product.product_code == code, Product.id != product_id).one_or_none()
    if conflict:
        raise HTTPException(status_code=409, detail="Product code already exists")

    materials = _load_materials(db, payload.material_ids)
    reason = _clean_required(payload.edit_reason, "Edit reason")
    before = _snapshot(db, product)
    _apply_fields(product, payload)
    product.updated_by = user.username
    _sync_materials(db, product, materials, user.username)
    after = _snapshot(db, product)
    if before == after:
        raise HTTPException(status_code=400, detail="No product changes were supplied")
    db.add(
        ProductAuditEvent(
            event_type="PRODUCT_UPDATED",
            product_id=product.id,
            product_code=product.product_code,
            product_name=product.product_name,
            actor_username=user.username,
            reason=reason,
            before_json=before,
            after_json=after,
        )
    )
    db.commit()
    db.refresh(product)
    return _out(db, product)


@router.patch("/{product_id}/status", response_model=ProductOut)
def change_product_status(
    product_id: int,
    payload: ProductStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.status_change")),
) -> ProductOut:
    product = db.query(Product).filter(Product.id == product_id).with_for_update().one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.status == payload.status:
        raise HTTPException(status_code=400, detail=f"Product is already {payload.status.lower()}")

    before = _snapshot(db, product)
    product.status = payload.status
    product.updated_by = user.username
    db.flush()
    after = _snapshot(db, product)
    db.add(
        ProductAuditEvent(
            event_type="PRODUCT_STATUS_CHANGED",
            product_id=product.id,
            product_code=product.product_code,
            product_name=product.product_name,
            actor_username=user.username,
            reason=_clean_required(payload.reason, "Status change reason"),
            before_json=before,
            after_json=after,
        )
    )
    db.commit()
    db.refresh(product)
    return _out(db, product)
