"""Regression checks for StkFlo material classification, UOM and precision."""
from __future__ import annotations

import unittest
from decimal import Decimal
from pathlib import Path

from pydantic import ValidationError

from app.material_classification import (
    ALLOWED_CATEGORY_TYPES,
    STOCK_UOMS,
    validate_base_uom,
    validate_material_classification,
)
from app.schemas import IssueBatchCreate, IssueBatchItem, ReceiptCreate

ROOT = Path(__file__).resolve().parents[2]


class StkFloStockIntegrityTests(unittest.TestCase):
    def test_exactly_twelve_supported_combinations(self) -> None:
        self.assertEqual(sum(len(types) for types in ALLOWED_CATEGORY_TYPES.values()), 12)
        self.assertEqual(ALLOWED_CATEGORY_TYPES["PACKAGING"], {"NA"})
        for category, kinds in ALLOWED_CATEGORY_TYPES.items():
            for kind in kinds:
                validate_material_classification(category, kind, "UNIT")
        for category, kind in [
            ("LIQUID_RAW_MAT", "OTHER"),
            ("PACKAGING", "PACKAGING"),
            ("TABLETS_CAPSULES", "EXCIPIENT"),
            ("NA", "OTHER"),
        ]:
            with self.subTest(category=category, kind=kind), self.assertRaises(ValueError):
                validate_material_classification(category, kind, "UNIT")

    def test_only_system_marker_can_use_na_category_and_uom(self) -> None:
        validate_material_classification("NA", "NA", "NA", system_marker=True)
        with self.assertRaises(ValueError):
            validate_material_classification("NA", "NA", "NA")
        with self.assertRaises(ValueError):
            validate_material_classification("NA", "NA", "UNIT", system_marker=True)

    def test_uoms_do_not_contain_kg_or_na_for_inventory(self) -> None:
        self.assertIn("AMP", STOCK_UOMS)
        self.assertIn("UNIT", STOCK_UOMS)
        self.assertNotIn("KG", STOCK_UOMS)
        self.assertNotIn("NA", STOCK_UOMS)
        validate_base_uom("L", "L")
        with self.assertRaises(ValueError):
            validate_base_uom("MG", "L")

    def test_six_decimal_consumption_and_batch_size_options(self) -> None:
        item = IssueBatchItem(
            material_code="MAT0001", lot_number="A", material_lot_id=1,
            qty=Decimal("0.000001"), uom_code="L",
        )
        package = IssueBatchItem(
            material_code="PKG0001", lot_number="P", material_lot_id=2,
            qty=Decimal("1"), uom_code="UNIT",
        )
        record = IssueBatchCreate(items=[item], packaging_items=[package], batch_size_uom="mL")
        self.assertEqual(record.items[0].qty, Decimal("0.000001"))
        with self.assertRaises(ValidationError):
            IssueBatchCreate(items=[item], packaging_items=[package], batch_size_uom="KG")
        with self.assertRaises(ValidationError):
            IssueBatchItem(material_code="MAT0001", lot_number="A", material_lot_id=1,
                           qty=Decimal("0.0000001"), uom_code="L")

    def test_nonpositive_receipts_rejected(self) -> None:
        data = dict(material_code="MAT0001", lot_number="A", receipt_date="2026-10-28",
                    uom_code="L", qty=Decimal("0"))
        with self.assertRaises(ValidationError):
            ReceiptCreate(**data)

    def test_sql_stock_precision_and_costing_basis(self) -> None:
        schema = (ROOT / "db/init/phase-1b_lots_and_txn.sql").read_text()
        view = (ROOT / "db/init/114_lot_balances_cost_columns.sql").read_text()
        bootstrap = (ROOT / "db/production-bootstrap.sh").read_text()
        self.assertIn("qty                     NUMERIC(18, 6) NOT NULL", schema)
        self.assertIn("ALTER COLUMN qty TYPE NUMERIC(18,6)", bootstrap)
        self.assertIn("st.txn_type = 'RECEIPT'", view)
        self.assertIn("GROUP BY ml.material_id, ml.lot_number", view)
        self.assertIn("lc.material_id = ml.material_id AND lc.lot_number = ml.lot_number", view)
        self.assertNotIn("WHEN st.direction = 1 THEN st.qty", view)

    def test_packaging_rule_and_system_marker_seed(self) -> None:
        quarantine = (ROOT / "db/init/100_expiry_threshold_settings.sql").read_text()
        marker = (ROOT / "db/init/126_seed_cancelled_bmr_marker.sql").read_text()
        self.assertIn("('PACKAGING', 'NA', 1", quarantine)
        self.assertIn("category_code = 'NA', type_code = 'NA', base_uom_code = 'NA'", marker)


if __name__ == "__main__":
    unittest.main()
