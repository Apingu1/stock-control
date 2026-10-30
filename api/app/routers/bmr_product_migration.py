"""StkFlo BMR product/formula migration: preview is read-only, commit is atomic.

Input contract: Products.csv + Master_Formulas.csv from the BMR extractor.
Only products with extracted Section 4 material rows are considered. The entire
source product list is NOT a migration source. No inventory transactions occur.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Material, Product, ProductAuditEvent, ProductMaterial, User
from ..security import require_permission

router = APIRouter(prefix="/admin/bmr-migration", tags=["migration"])
MAX_BYTES = 12_000_000
MAX_ROWS = 30000
P_REQUIRED = {
    "product_code", "product_name_bmr", "bmr_version", "bmr_shelf_life_days",
    "licensed_status", "medisource_line", "formula_basis"
}
F_REQUIRED = {
    "product_code", "bmr_version", "material_sequence", "material_name",
    "master_formula_raw", "quantity_type", "material_strength", "formula_basis"
}

class ImportPreview(BaseModel):
    products_csv: str = Field(min_length=1)
    formulas_csv: str = Field(min_length=1)
    update_existing: bool = False

class ImportCommit(ImportPreview):
    source_sha256: str = Field(min_length=64, max_length=64)
    approval_reference: str = Field(min_length=3, max_length=200)
    confirm: str


def _read(raw: str, required: set[str], name: str) -> list[dict]:
    if len(raw.encode("utf-8")) > MAX_BYTES:
        raise HTTPException(413, f"{name} is larger than 12 MB")
    try:
        reader = csv.DictReader(io.StringIO(raw.lstrip("\ufeff")), strict=True)
        fields = set(reader.fieldnames or ())
        if not required <= fields:
            raise HTTPException(400, f"{name} missing columns: {sorted(required - fields)}")
        if len(fields) != len(reader.fieldnames or []):
            raise HTTPException(400, f"{name} contains duplicate column headings")
        output = []
        for row in reader:
            if None in row:
                raise HTTPException(400, f"{name} has malformed rows")
            output.append({k: (v or "").strip() for k, v in row.items()})
            if len(output) > MAX_ROWS:
                raise HTTPException(413, f"{name} exceeds {MAX_ROWS} rows")
        return output
    except (csv.Error, UnicodeError) as exc:
        raise HTTPException(400, f"Invalid {name}: {exc}") from exc


def _sha(payload: ImportPreview):
    return hashlib.sha256(
        (payload.products_csv + "\0" + payload.formulas_csv + "\0" +
         str(payload.update_existing)).encode("utf-8")
    ).hexdigest()


def _yes(value: str):
    return value.casefold() in ("yes", "y", "true", "1", "m", "stock", "fridge", "cd")


def _version(version: str):
    match = re.fullmatch(r"V(\d+)", version.upper())
    if not match:
        raise ValueError("Expected BMR version V01, V02, etc.")
    return int(match.group(1))


def _num(value: str):
    if not value:
        return None
    try:
        number = Decimal(value)
        if not number.is_finite() or number < 0 or abs(number.as_tuple().exponent) > 8:
            raise ValueError()
        return number
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Invalid non-negative formula quantity: {value}") from exc


def _validate(payload: ImportPreview, db: Session):
    if db.execute(text("SELECT to_regclass('public.product_formula_versions')")).scalar() is None:
        raise HTTPException(503, "Apply database migration 130_product_formula_import.sql first")
    ps = _read(payload.products_csv, P_REQUIRED, "Products.csv")
    fs = _read(payload.formulas_csv, F_REQUIRED, "Master_Formulas.csv")
    errors, warnings = [], []
    products = {}
    lines = defaultdict(list)
    for rownum, p in enumerate(ps, 2):
        code = p["product_code"].strip().upper()
        ver = p["bmr_version"].strip().upper()
        key = (code, ver)
        if key in products:
            errors.append({"file": "Products.csv", "row": rownum, "message": f"Duplicate product/version {code}/{ver}"})
            continue
        try:
            _version(ver)
            days = int(p["bmr_shelf_life_days"])
            if days < 1:
                raise ValueError()
        except ValueError:
            errors.append({"file": "Products.csv", "row": rownum, "message": "Invalid version or shelf-life days"})
            continue
        if not code or len(code) > 50 or not p["product_name_bmr"]:
            errors.append({"file": "Products.csv", "row": rownum, "message": "Product code or name missing/invalid"})
            continue
        if p["licensed_status"].upper() not in ("LICENSED", "UNLICENSED"):
            errors.append({"file": "Products.csv", "row": rownum, "message": "Licence classification missing"})
            continue
        if p["medisource_line"].upper() not in ("YES", "NO", "Y", "N", "M", "N/A", "NA"):
            errors.append({"file": "Products.csv", "row": rownum, "message": "Medisource/Export classification missing"})
            continue
        products[key] = (rownum, p)
    for rownum, f in enumerate(fs, 2):
        key = (f["product_code"].upper(), f["bmr_version"].upper())
        if key not in products:
            errors.append({"file": "Master_Formulas.csv", "row": rownum, "message": "Formula references missing product BMR"})
            continue
        try:
            sequence = int(f["material_sequence"])
            if sequence < 1:
                raise ValueError("Material sequence must be positive")
            _num(f.get("quantity_value", ""))
            _num(f.get("qs_target_value", ""))
        except ValueError as exc:
            errors.append({"file": "Master_Formulas.csv", "row": rownum, "message": str(exc)})
            continue
        if not f["material_name"].strip():
            errors.append({"file": "Master_Formulas.csv", "row": rownum, "message": "Material name missing"})
            continue
        if f["quantity_type"].casefold().startswith("qs") and f.get("quantity_value", ""):
            errors.append({"file": "Master_Formulas.csv", "row": rownum,
                           "message": "Q.s. quantity must not be a fixed quantity"})
            continue
        lines[key].append((rownum, f, sequence))
    codes = [k[0] for k in products]
    if len(codes) != len(set(codes)):
        errors.append({"file": "Products.csv", "row": 0, "message": "Multiple versions of one product in a single import"})
    existing = {
        p.product_code: p for p in db.query(Product).filter(Product.product_code.in_(codes)).all()
    }
    raw_names = {f["material_name"].strip().casefold() for arr in lines.values() for _, f, _ in arr}
    found_materials = db.query(Material).filter(func.lower(Material.name).in_(raw_names)).all()
    by_name = defaultdict(list)
    for material in found_materials:
        by_name[material.name.casefold().strip()].append(material)
    plan = []
    resolved = []
    for key, (rownum, p) in products.items():
        code, ver = key
        formula = lines[key]
        if not formula:
            errors.append({"file": "Products.csv", "row": rownum, "message": "No extracted Section 4 material rows"})
            continue
        current = existing.get(code)
        if current:
            if not payload.update_existing:
                plan.append({"product_code": code, "version": ver, "action": "SKIP_EXISTING", "material_count": len(formula)})
                continue
            try:
                if _version(ver) <= _version(current.version_number):
                    errors.append({"file": "Products.csv", "row": rownum, "message": "New BMR version must exceed current version"})
                    continue
            except ValueError:
                errors.append({"file": "Products.csv", "row": rownum, "message": "Existing BMR version cannot be compared"})
                continue
        used_ids, used_sequences, matched = set(), set(), []
        for line_no, f, seq in formula:
            candidates = by_name[f["material_name"].strip().casefold()]
            if len(candidates) != 1:
                errors.append({"file": "Master_Formulas.csv", "row": line_no,
                               "message": f"Missing/ambiguous exact material match: {f['material_name']}"})
                continue
            material = candidates[0]
            if material.status != "ACTIVE" or material.is_cancelled_bmr_marker:
                errors.append({"file": "Master_Formulas.csv", "row": line_no,
                               "message": f"Material unavailable: {f['material_name']}"})
            if seq in used_sequences:
                errors.append({"file": "Master_Formulas.csv", "row": line_no,
                               "message": "Duplicate formula sequence"})
            used_ids.add(material.id)
            used_sequences.add(seq)
            matched.append((material, f, seq))
        action = "UPDATE_TO_NEW_VERSION" if current else "CREATE"
        plan.append({"product_code": code, "version": ver, "action": action,
                     "material_count": len(formula)})
        resolved.append((p, current, matched))
        if p.get("review_status", "") != "READY FOR QA VERIFICATION":
            warnings.append({"file": "Products.csv", "row": rownum, "message": "Source BMR has outstanding extraction review status"})
    sha = _sha(payload)
    already = db.execute(text(
        "SELECT id FROM product_bmr_imports WHERE source_sha256=:sha"
    ), {"sha": sha}).scalar()
    return ({
        "source_sha256": sha,
        "blocked": bool(errors) or bool(already),
        "duplicate_import_id": already,
        "error_count": len(errors), "warning_count": len(warnings),
        "errors": errors[:300], "warnings": warnings[:300],
        "products_in_source": len(ps), "formula_rows_in_source": len(fs),
        "products_to_create": sum(p["action"] == "CREATE" for p in plan),
        "products_to_update": sum(p["action"] == "UPDATE_TO_NEW_VERSION" for p in plan),
        "existing_skipped": sum(p["action"] == "SKIP_EXISTING" for p in plan),
        "formula_lines_to_import": sum(p["material_count"] for p in plan if p["action"] != "SKIP_EXISTING"),
        "plan": plan[:5000],
    }, resolved)


@router.post("/preview")
def preview(payload: ImportPreview,
            db: Session = Depends(get_db),
            _user: User = Depends(require_permission("data_migration.view"))):
    return _validate(payload, db)[0]


@router.post("/commit")
def commit(payload: ImportCommit,
           db: Session = Depends(get_db),
           user: User = Depends(require_permission("data_migration.commit"))):
    if payload.confirm != "IMPORT PRODUCT BMRS":
        raise HTTPException(400, "Exact confirmation phrase required")
    if not payload.approval_reference.strip():
        raise HTTPException(400, "Approval reference is required")
    # One transaction covers products, current mandatory-material links,
    # historical BMR formula versions and the import manifest.
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext('stkflo_bmr_import'))"))
        result, resolved = _validate(payload, db)
        if result["source_sha256"] != payload.source_sha256.lower():
            raise HTTPException(409, "Source data changed after preview; validate again")
        if result["blocked"]:
            raise HTTPException(400, {"message": "BMR import validation failed", "result": result})
        created, updated, linked = 0, 0, 0
        manifest = []
        for p, current, formula in resolved:
            code, ver = p["product_code"].upper(), p["bmr_version"].upper()
            fields = {
                "product_name": p["product_name_bmr"],
                "reference": p.get("bmr_document_number", ""),
                "version_number": ver,
                "shelf_life_days": int(p["bmr_shelf_life_days"]),
                "licence_status": p["licensed_status"].upper(),
                "line_type": "STOCK_LINE" if _yes(p.get("stock_line", "")) else "BESPOKE",
                "storage_condition": "FRIDGELINE" if _yes(p.get("fridge_line", "")) or "fridge" in p.get("storage_conditions", "").casefold() else "AMBIENT",
                "controlled_drug_status": "CONTROLLED_DRUG" if _yes(p.get("controlled_drug", "")) else "N_A",
                "export_status": "EXPORT_LINE" if _yes(p["medisource_line"]) else "N_A",
            }
            if current is None:
                current = Product(product_code=code, status="ACTIVE", created_by=user.username,
                                  updated_by=user.username, **fields)
                db.add(current)
                db.flush()
                created += 1
            else:
                for field, value in fields.items():
                    setattr(current, field, value)
                current.updated_by = user.username
                updated += 1
            old_materials = {
                r.material_id: r for r in db.query(ProductMaterial).filter(
                    ProductMaterial.product_id == current.id).all()
            }
            required_ids = {m.id for m, _, _ in formula}
            for matid, relation in old_materials.items():
                relation.is_active = matid in required_ids
                relation.updated_by = user.username
            for matid in required_ids - old_materials.keys():
                db.add(ProductMaterial(product_id=current.id, material_id=matid, is_active=True,
                                       created_by=user.username, updated_by=user.username))
            db.flush()
            header = db.execute(text("""
                INSERT INTO product_formula_versions
                (product_id, version_number, formula_basis, source_bmr_file, source_document,
                 created_by, updated_by)
                VALUES (:pid,:ver,:basis,:bmr,:doc,:actor,:actor) RETURNING id
            """), {"pid":current.id,"ver":ver,"basis":p.get("formula_basis",""),
                   "bmr":p.get("bmr_file",""),"doc":p.get("bmr_document_number",""),
                   "actor":user.username}).scalar_one()
            for mat, f, seq in formula:
                db.execute(text("""
                    INSERT INTO product_formula_lines
                    (formula_version_id,material_id,material_sequence,source_material_name,
                     material_strength,master_formula_raw,quantity_type,quantity_value,
                     quantity_unit,qs_target_value,qs_target_unit,conditional_material,
                     manufacturer_supplier,section4_table,section4_row)
                    VALUES (:header,:material,:seq,:source_name,:strength,:raw,:qtype,:qty,
                     :unit,:qs,:qsunit,:conditional,:supplier,:table,:row)
                """), {
                    "header":header,"material":mat.id,"seq":seq,
                    "source_name":f["material_name"],"strength":f["material_strength"],
                    "raw":f["master_formula_raw"],"qtype":f["quantity_type"],
                    "qty":_num(f.get("quantity_value","")),
                    "unit":f.get("quantity_unit",""),
                    "qs":_num(f.get("qs_target_value","")),
                    "qsunit":f.get("qs_target_unit",""),
                    "conditional":_yes(f.get("conditional_material","")),
                    "supplier":f.get("manufacturer_supplier",""),
                    "table":f.get("section4_table",""),"row":f.get("section4_row",""),
                })
                linked += 1
            db.add(ProductAuditEvent(event_type="PRODUCT_IMPORTED_BMR",product_id=current.id,
                                     product_code=code,product_name=current.product_name,
                                     actor_username=user.username,
                                     reason=f"BMR import: {payload.approval_reference}",
                                     before_json=None,after_json={
                                         "version":ver, "material_ids":sorted(required_ids),
                                         "source_bmr_file":p.get("bmr_file","")
                                     }))
            manifest.append({"product_code":code,"version":ver,
                             "material_count":len(formula),"source_bmr":p.get("bmr_file","")})
        migration_id = db.execute(text("""
            INSERT INTO product_bmr_imports
            (source_sha256,imported_by,approval_reference,products_created,
             formulas_created,materials_linked,manifest)
            VALUES (:sha,:actor,:ref,:created,:formulas,:linked,CAST(:manifest AS jsonb))
            RETURNING id
        """), {"sha":result["source_sha256"],"actor":user.username,
               "ref":payload.approval_reference.strip(),"created":created,
               "formulas":created+updated,"linked":linked,
               "manifest":__import__("json").dumps(manifest)}).scalar_one()
        db.commit()
        return {"ok":True,"migration_id":migration_id,
                "products_created":created,"products_updated":updated,"formula_lines":linked}
    except Exception:
        db.rollback()
        raise


@router.get("/history")
def history(db: Session = Depends(get_db),
            _user: User = Depends(require_permission("data_migration.view"))):
    if db.execute(text("SELECT to_regclass('public.product_bmr_imports')")).scalar() is None:
        return []
    rows = db.execute(text("""
        SELECT id,imported_at,imported_by,approval_reference,products_created,
               formulas_created,materials_linked
        FROM product_bmr_imports ORDER BY id DESC LIMIT 50
    """)).mappings().all()
    return [dict(row, imported_at=row["imported_at"].isoformat()) for row in rows]
