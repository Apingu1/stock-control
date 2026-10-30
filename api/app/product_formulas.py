"""Current-version formula read/write support for the Product Library.

Manual corrections are audit-trailed by the calling products router. A newer BMR
version inserts a new header while preserving all older formula versions.
"""
from __future__ import annotations

from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


def read_formula(db: Session, product_id: int, version: str) -> dict:
    if db.execute(text("SELECT to_regclass('public.product_formula_versions')")).scalar() is None:
        return {"formula_basis": "", "formula_lines": []}
    header = db.execute(text("""
        SELECT id, formula_basis FROM product_formula_versions
        WHERE product_id=:id AND version_number=:version
    """), {"id": product_id, "version": version}).mappings().first()
    if not header:
        return {"formula_basis": "", "formula_lines": []}
    lines = db.execute(text("""
        SELECT material_id, material_sequence, source_material_name, material_strength,
               master_formula_raw, quantity_type, quantity_value, quantity_unit,
               qs_target_value, qs_target_unit, conditional_material
        FROM product_formula_lines WHERE formula_version_id=:id ORDER BY material_sequence
    """), {"id": header["id"]}).mappings().all()
    return {"formula_basis": header["formula_basis"], "formula_lines": [
        {k: (str(v) if isinstance(v, Decimal) else v) for k, v in row.items()}
        for row in lines
    ]}


def save_formula(db: Session, product_id: int, version: str, basis: str,
                 lines: list, username: str, expected_ids: set[int]):
    if not version:
        raise HTTPException(400, "BMR version is required when saving a formula")
    if not lines:
        raise HTTPException(400, "Formula cannot be empty")
    ids = [line.material_id for line in lines]
    if set(ids) != expected_ids:
        raise HTTPException(400, "Formula materials must match selected mandatory materials exactly")
    sequences = [line.material_sequence for line in lines]
    if len(sequences) != len(set(sequences)):
        raise HTTPException(400, "Duplicate material sequence")
    for line in lines:
        if line.quantity_type.casefold().startswith("qs") and line.quantity_value is not None:
            raise HTTPException(400, "Q.s. lines cannot contain fixed numeric quantities")
    existing_id = db.execute(text("""
        SELECT id FROM product_formula_versions
        WHERE product_id=:id AND version_number=:version FOR UPDATE
    """), {"id": product_id, "version": version}).scalar()
    if existing_id is None:
        existing_id = db.execute(text("""
            INSERT INTO product_formula_versions
            (product_id,version_number,formula_basis,created_by,updated_by)
            VALUES (:pid,:ver,:basis,:actor,:actor) RETURNING id
        """), {"pid":product_id,"ver":version,"basis":basis,"actor":username}).scalar_one()
    else:
        db.execute(text("""
            UPDATE product_formula_versions SET formula_basis=:basis,
              updated_by=:actor,updated_at=now() WHERE id=:id
        """), {"basis":basis,"actor":username,"id":existing_id})
        db.execute(text("DELETE FROM product_formula_lines WHERE formula_version_id=:id"),
                   {"id":existing_id})
    for line in lines:
        db.execute(text("""
            INSERT INTO product_formula_lines
            (formula_version_id,material_id,material_sequence,source_material_name,
             material_strength,master_formula_raw,quantity_type,quantity_value,
             quantity_unit,qs_target_value,qs_target_unit,conditional_material)
            VALUES (:fid,:mid,:seq,:name,:strength,:raw,:qtype,:qty,:unit,:qs,:qsunit,:cond)
        """), {"fid":existing_id,"mid":line.material_id,"seq":line.material_sequence,
               "name":line.source_material_name or "",
               "strength":line.material_strength or "",
               "raw":line.master_formula_raw or "",
               "qtype":line.quantity_type or "",
               "qty":line.quantity_value,
               "unit":line.quantity_unit or "",
               "qs":line.qs_target_value,
               "qsunit":line.qs_target_unit or "",
               "cond":bool(line.conditional_material)})
