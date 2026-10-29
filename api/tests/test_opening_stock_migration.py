"""Read-only migration parser and valuation tests (no live database required)."""
import unittest

from app.routers.opening_stock_migration import HEADERS, _evaluate, _read_csv


class EmptyDB:
    def query(self, *_args):
        return self

    def filter(self, *_args):
        return self

    def all(self):
        return []


def make_csv(*, qty="350", unit="0.20", value="70.00", include="YES", cost_ref="INV-123"):
    header = ",".join(HEADERS)
    def row(values):
        return ",".join(str(values.get(h, "")) for h in HEADERS)
    material = {
        "record_type": "MATERIAL", "material_code": "TEST1001",
        "material_name": "Test excipient", "category_code": "SOLID_RAW_MAT",
        "type_code": "EXCIPIENT", "uom_code": "G", "material_status": "ACTIVE",
    }
    lot = {
        "record_type": "LOT", "material_code": "TEST1001",
        "lot_number": "T-010", "lot_status": "QUARANTINE",
        "include_opening": include, "confirmed_qty": qty,
        "original_unit_cost_gbp": unit, "current_stock_value_gbp": value,
        "cost_source_reference": cost_ref, "qa_verification_reference": "QA-123",
        "qa_verified_by": "QA tester",
    }
    return "\n".join([header, row(material), row(lot)]) + "\n"


class OpeningStockMigrationTests(unittest.TestCase):
    def test_value_is_remaining_quantity_times_unit_cost(self):
        result, materials, lots = _evaluate(make_csv(), EmptyDB())
        self.assertFalse(result["blocked"], result["issues"])
        self.assertEqual(result["material_rows"], 1)
        self.assertEqual(len(materials), 1)
        self.assertEqual(len(lots), 1)
        self.assertEqual(result["total_value_gbp"], "70.00")
        self.assertEqual(str(lots[0]["unit"]), "0.200000")

    def test_bad_valuation_is_rejected(self):
        result, _, _ = _evaluate(make_csv(value="200.00"), EmptyDB())
        self.assertTrue(result["blocked"])
        self.assertTrue(any("disagrees" in x["message"] for x in result["issues"]))

    def test_missing_invoice_reference_is_rejected(self):
        result, _, _ = _evaluate(make_csv(cost_ref=""), EmptyDB())
        self.assertTrue(result["blocked"])
        self.assertTrue(any("Cost source" in x["message"] for x in result["issues"]))

    def test_zero_or_negative_qty_is_rejected(self):
        for qty in ["0", "-1"]:
            result, _, _ = _evaluate(make_csv(qty=qty), EmptyDB())
            self.assertTrue(result["blocked"])

    def test_unselected_lot_cannot_post(self):
        result, _, lots = _evaluate(make_csv(include="NO"), EmptyDB())
        self.assertEqual(len(lots), 0)
        self.assertEqual(result["opening_lots"], 0)
        self.assertTrue(result["blocked"])

    def test_utf8_bom_csv_is_accepted(self):
        data = _read_csv("\ufeff" + make_csv())
        self.assertEqual(len(data), 2)


if __name__ == "__main__":
    unittest.main()
