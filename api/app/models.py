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

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MaterialCategory code={self.code!r}>"


class MaterialType(Base):
    __tablename__ = "material_types"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    materials: Mapped[list["Material"]] = relationship(back_populates="type")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MaterialType code={self.code!r}>"


class Uom(Base):
    __tablename__ = "uoms"

    # DB: uoms.code VARCHAR(20) PRIMARY KEY
    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    # DB: uoms.description VARCHAR(100) NOT NULL
    description: Mapped[str] = mapped_column(String(100), nullable=False)

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

    # Default manufacturer/supplier; true traceability is on MaterialLot.
    manufacturer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    complies_es_criteria: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")

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

    lots: Mapped[list["MaterialLot"]] = relationship(
        "MaterialLot",
        back_populates="material",
        cascade="all, delete-orphan",
    )

    # Approved manufacturers for tablets/capsules etc.
    approved_manufacturers: Mapped[list["MaterialApprovedManufacturer"]] = relationship(
        "MaterialApprovedManufacturer",
        back_populates="material",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Material code={self.material_code!r} name={self.name!r}>"


# --- Approved manufacturers per material ------------------------------------


class MaterialApprovedManufacturer(Base):
    __tablename__ = "material_approved_manufacturers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    material_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("materials.id", ondelete="CASCADE"), nullable=False
    )
    manufacturer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    material: Mapped["Material"] = relationship(
        "Material", back_populates="approved_manufacturers"
    )

    __table_args__ = (
        UniqueConstraint(
            "material_id",
            "manufacturer_name",
            name="uq_material_approved_manu_material_name",
        ),
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<MaterialApprovedManufacturer material_id={self.material_id} "
            f"name={self.manufacturer_name!r}>"
        )


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

    material: Mapped["Material"] = relationship("Material", back_populates="lots")
    transactions: Mapped[list["StockTransaction"]] = relationship(
        "StockTransaction", back_populates="material_lot"
    )

    # NEW: status change history
    status_changes: Mapped[list["LotStatusChange"]] = relationship(
        "LotStatusChange",
        back_populates="material_lot",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MaterialLot material_id={self.material_id} lot={self.lot_number!r}>"


class StockTransaction(Base):
    __tablename__ = "stock_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    material_lot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_lots.id"), nullable=False
    )

    # RECEIPT / ISSUE
    txn_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # NEW: consumption type for ISSUE records:
    #  USAGE / WASTAGE / DESTRUCTION / R_AND_D
    consumption_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="USAGE"
    )

    qty: Mapped[float] = mapped_column(Float, nullable=False)
    uom_code: Mapped[str] = mapped_column(String(50), nullable=False)

    # +1 for receipts, -1 for issues
    direction: Mapped[int] = mapped_column(Integer, nullable=False)

    unit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Optional reference (e.g. GRN, worksheet ref, internal link)
    target_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # NEW: ES batch or R&D reference for usage
    product_batch_no: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )

    # Product manufacture date for issues (batch usage)
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

    material_lot: Mapped["MaterialLot"] = relationship(
        "MaterialLot", back_populates="transactions"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<StockTransaction id={self.id} "
            f"lot_id={self.material_lot_id} qty={self.qty} dir={self.direction}>"
        )


# --- Lot status change history ----------------------------------------------


class LotStatusChange(Base):
    __tablename__ = "lot_status_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    material_lot_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_lots.id"), nullable=False
    )
    old_status: Mapped[str] = mapped_column(String(20), nullable=False)
    new_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)

    changed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    material_lot: Mapped["MaterialLot"] = relationship(
        "MaterialLot", back_populates="status_changes"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<LotStatusChange lot_id={self.material_lot_id} "
            f"{self.old_status!r}->{self.new_status!r}>"
        )
