from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# --- Base ---------------------------------------------------------------------


class Base(DeclarativeBase):
    pass


# --- Lookup tables -----------------------------------------------------------


class MaterialCategory(Base):
    __tablename__ = "material_categories"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    materials: Mapped[list["Material"]] = relationship(back_populates="category")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<MaterialCategory code={self.code!r}>"


class MaterialType(Base):
    __tablename__ = "material_types"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    materials: Mapped[list["Material"]] = relationship(back_populates="type")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<MaterialType code={self.code!r}>"


class Uom(Base):
    __tablename__ = "uoms"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    materials: Mapped[list["Material"]] = relationship(back_populates="uom")

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Uom code={self.code!r}>"


# --- Materials ---------------------------------------------------------------


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    material_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    category_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("material_categories.code"), nullable=False
    )
    type_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("material_types.code"), nullable=False
    )
    base_uom_code: Mapped[str] = mapped_column(
        String(50), ForeignKey("uoms.code"), nullable=False
    )

    # These stay as “default” fields for the material, but the true
    # traceable manufacturer/supplier now live on MaterialLot.
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    complies_es_criteria: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(
        String(20), default="ACTIVE"
    )  # e.g. ACTIVE / RETIRED / QUARANTINE

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # relationships
    category: Mapped["MaterialCategory"] = relationship(back_populates="materials")
    type: Mapped["MaterialType"] = relationship(back_populates="materials")
    uom: Mapped["Uom"] = relationship(back_populates="materials")

    # NEW: relationship to lots so MaterialLot.material back_populates works
    lots: Mapped[list["MaterialLot"]] = relationship(
        "MaterialLot",
        back_populates="material",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<Material code={self.material_code!r} name={self.name!r}>"


# --- Material lots & stock transactions -------------------------------------


class MaterialLot(Base):
    __tablename__ = "material_lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    material_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("materials.id"), nullable=False
    )

    lot_number: Mapped[str] = mapped_column(String(100), nullable=False)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Lot status – QUARANTINE / RELEASED / REJECTED / EXPIRED etc.
    status: Mapped[str] = mapped_column(String(20), default="QUARANTINE")

    # Manufacturer / supplier at lot level (true traceability)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "material_id",
            "lot_number",
            name="uq_material_lots_material_lot_number",
        ),
    )

    # relationships
    material: Mapped["Material"] = relationship(
        "Material", back_populates="lots"
    )
    transactions: Mapped[list["StockTransaction"]] = relationship(
        "StockTransaction", back_populates="material_lot"
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<MaterialLot material_id={self.material_id} lot={self.lot_number!r}>"


class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    material_lot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_lots.id"), nullable=False
    )

    # RECEIPT / ISSUE
    txn_type: Mapped[str] = mapped_column(String(20), nullable=False)

    qty: Mapped[float] = mapped_column(Float, nullable=False)
    uom_code: Mapped[str] = mapped_column(String(50), nullable=False)

    # +1 for receipts, -1 for issues
    direction: Mapped[int] = mapped_column(Integer, nullable=False)

    unit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Free-text reference, e.g. GRN number, batch number, order, etc.
    target_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # NEW: product manufacture date for ISSUES (Batch usage)
    product_manufacture_date: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )

    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "direction IN (1, -1)",
            name="ck_stock_transactions_direction_valid",
        ),
    )

    # relationships
    material_lot: Mapped["MaterialLot"] = relationship(
        "MaterialLot", back_populates="transactions"
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"<StockTransaction id={self.id} "
            f"lot_id={self.material_lot_id} qty={self.qty} dir={self.direction}>"
        )
