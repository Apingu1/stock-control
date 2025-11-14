from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import declarative_base, Mapped, mapped_column, relationship

Base = declarative_base()

# --- Lookups ----------------------------------------------------

class MaterialCategory(Base):
    __tablename__ = "material_categories"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    materials: Mapped[list["Material"]] = relationship(
        back_populates="category"
    )


class MaterialType(Base):
    __tablename__ = "material_types"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    materials: Mapped[list["Material"]] = relationship(
        back_populates="type"
    )


class Uom(Base):
    __tablename__ = "uoms"

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    description: Mapped[str] = mapped_column(String(100), nullable=False)

    materials: Mapped[list["Material"]] = relationship(
        back_populates="uom"
    )

# --- Materials master -------------------------------------------

class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)

    category_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("material_categories.code"), nullable=False
    )
    type_code: Mapped[str] = mapped_column(
        String(20), ForeignKey("material_types.code"), nullable=False
    )
    base_uom_code: Mapped[str] = mapped_column(
        String(20), ForeignKey("uoms.code"), nullable=False
    )

    manufacturer: Mapped[Optional[str]] = mapped_column(Text)
    supplier: Mapped[Optional[str]] = mapped_column(Text)

    complies_es_criteria: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    # relationships
    category: Mapped[MaterialCategory] = relationship(back_populates="materials")
    type: Mapped[MaterialType] = relationship(back_populates="materials")
    uom: Mapped[Uom] = relationship(back_populates="materials")

# --- Material lots & stock transactions -------------------------


class MaterialLot(Base):
    __tablename__ = "material_lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("materials.id"), nullable=False
    )
    lot_number: Mapped[str] = mapped_column(String(100), nullable=False)
    expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="QUARANTINE"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100))

    material: Mapped["Material"] = relationship("Material", backref="lots")
    transactions: Mapped[list["StockTransaction"]] = relationship(
        "StockTransaction", back_populates="material_lot"
    )


class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material_lot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_lots.id"), nullable=False
    )
    txn_type: Mapped[str] = mapped_column(String(20), nullable=False)  # RECEIPT/ISSUE…
    qty: Mapped[float] = mapped_column()
    uom_code: Mapped[str] = mapped_column(
        String(20), ForeignKey("uoms.code"), nullable=False
    )
    direction: Mapped[int] = mapped_column()  # +1 for in, -1 for out
    unit_price: Mapped[Optional[float]] = mapped_column()
    total_value: Mapped[Optional[float]] = mapped_column()
    target_ref: Mapped[Optional[str]] = mapped_column(Text)  # ES batch / GRN no.
    comment: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    created_by: Mapped[str] = mapped_column(String(100), nullable=False)

    material_lot: Mapped[MaterialLot] = relationship(back_populates="transactions")
