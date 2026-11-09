"""Regression coverage for versioned generic flavouring rules."""
from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace

from pydantic import ValidationError

from app.material_classification import validate_material_classification
from app.schemas import ProductFormulaLineIn

ROOT = Path(__file__).resolve().parents[2]


class FlavouringFormulaTests(unittest.TestCase):
    def line(self, **kwargs):
        return ProductFormulaLineIn(material_sequence=1, source_material_name="test", **kwargs)

    def test_flavour_is_genuine_stock_classification(self):
        validate_material_classification("FLAVOURING", "NA", "ML")
        with self.assertRaises(ValueError):
            validate_material_classification("FLAVOURING", "API", "ML")

    def test_optional_and_mandatory_identifiers(self):
        optional = self.line(ingredient_code="FLAVOUR_OPTIONAL", conditional_material=True)
        required = self.line(ingredient_code="FLAVOUR_REQUIRED", conditional_material=False)
        self.assertIsNone(optional.material_id)
        self.assertFalse(required.conditional_material)
        for bad in (
            dict(ingredient_code="FLAVOUR_OPTIONAL", conditional_material=False),
            dict(ingredient_code="FLAVOUR_REQUIRED", conditional_material=True),
            dict(ingredient_code="FLAVOUR_OPTIONAL", conditional_material=True, material_id=11),
            dict(),
        ):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                self.line(**bad)
        self.assertEqual(self.line(material_id=11).material_id, 11)

    def test_migration_is_additive_and_does_not_change_packaging_ledger(self):
        sql = (ROOT / "db/init/131_flavouring_formula_slots.sql").read_text()
        self.assertIn("FLAVOURING', 'NA', 1", sql)
        self.assertIn("ALTER COLUMN material_id DROP NOT NULL", sql)
        self.assertIn("uq_product_formula_generic_flavour", sql)
        self.assertNotIn("ALTER TABLE stock_transactions", sql)
        self.assertNotIn("ALTER TABLE material_lots", sql)

    def test_flavour_consumption_remains_exact_lot(self):
        backend = (ROOT / "api/app/routers/issues.py").read_text()
        frontend = (ROOT / "web/src/components/modals/BatchIssueCreateModal.tsx").read_text()
        self.assertIn('lot.id == item.material_lot_id', backend)
        self.assertIn('lot.lot_number != item.lot_number', backend)
        self.assertIn('material.category_code == "FLAVOURING"', backend)
        self.assertIn("Type flavour name to see available lots", frontend)


if __name__ == "__main__":
    unittest.main()
