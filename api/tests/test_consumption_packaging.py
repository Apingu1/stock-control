from __future__ import annotations

import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

from pydantic import ValidationError

from app.routers.issues import _is_packaging_material
from app.schemas import IssueBatchCreate, IssueBatchItem


def _item(code: str, lot_id: int) -> IssueBatchItem:
    return IssueBatchItem(
        material_code=code,
        lot_number=f"LOT-{lot_id}",
        material_lot_id=lot_id,
        qty=Decimal("1"),
        uom_code="EA",
    )


class ConsumptionPackagingTests(unittest.TestCase):
    def test_manufactured_batch_requires_packaging(self) -> None:
        with self.assertRaisesRegex(ValidationError, "At least one packaging lot"):
            IssueBatchCreate(items=[_item("MAT0001", 1)])

        payload = IssueBatchCreate(
            items=[_item("MAT0001", 1)],
            packaging_items=[_item("PKG0001", 2)],
        )
        self.assertEqual(payload.packaging_items[0].material_lot_id, 2)

    def test_non_batch_stock_issue_does_not_require_packaging(self) -> None:
        payload = IssueBatchCreate(
            consumption_type="DESTRUCTION",
            items=[_item("MAT0001", 1)],
        )
        self.assertEqual(payload.packaging_items, [])

    def test_packaging_classification_accepts_category_or_type(self) -> None:
        by_category = SimpleNamespace(category_code="PACKAGING", type_code="OTHER")
        by_type = SimpleNamespace(category_code="NA", type_code="packaging")
        material = SimpleNamespace(category_code="SOLID_RAW_MAT", type_code="EXCIPIENT")

        self.assertTrue(_is_packaging_material(by_category))
        self.assertTrue(_is_packaging_material(by_type))
        self.assertFalse(_is_packaging_material(material))

    def test_migration_preserves_history_and_exposes_analytics_type(self) -> None:
        root = Path(__file__).resolve().parents[2]
        migration = (root / "db/init/128_consumption_packaging_lines.sql").read_text(
            encoding="utf-8"
        )
        self.assertIn("DEFAULT 'MATERIAL'", migration)
        self.assertIn("'MATERIAL', 'PACKAGING'", migration)
        self.assertIn("CREATE OR REPLACE VIEW analytics_batch_materials", migration)
        self.assertIn("st.consumption_line_type", migration)


if __name__ == "__main__":
    unittest.main()
