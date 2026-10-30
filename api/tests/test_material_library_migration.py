"""Material-only import parser tests; no database writes."""
import csv
import io
import unittest

from app.routers.material_library_migration import REQUIRED, _evaluate


class EmptyDB:
    def query(self, *args):
        return self

    def filter(self, *args):
        return self

    def all(self):
        return []


def sample_csv(*, minimum="250", days="90", duplicate=False, category="SOLID_RAW_MAT"):
    row = {
        "material_code": "MAT9001",
        "material_name": "Example API",
        "category_code": category, "type_code": "API",
        "base_uom_code": "G", "material_status": "ACTIVE",
        "manufacturer": "EXAMPLE MAKER", "supplier": "EXAMPLE SUPPLIER",
        "low_stock_threshold_qty": minimum, "expiry_alert_days": days,
    }
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=REQUIRED, lineterminator="\n")
    writer.writeheader()
    writer.writerow(row)
    if duplicate:
        writer.writerow(row)
    return stream.getvalue()


class MaterialOnlyMigrationTests(unittest.TestCase):
    def test_materials_only_with_thresholds_and_no_stock(self):
        result, materials, existing = _evaluate(sample_csv(), EmptyDB())
        self.assertFalse(result["blocked"], result["errors"])
        self.assertEqual(result["to_create"], 1)
        self.assertEqual(result["low_stock_populated"], 1)
        self.assertEqual(result["expiry_90_days"], 1)
        self.assertEqual(result["stock_receipts"], 0)
        self.assertEqual(str(materials[0]["low_stock_threshold_qty"]), "250")
        self.assertEqual(materials[0]["expiry_alert_days"], 90)

    def test_missing_minimum_is_not_invented(self):
        result, materials, _ = _evaluate(sample_csv(minimum=""), EmptyDB())
        self.assertFalse(result["blocked"])
        self.assertIsNone(materials[0]["low_stock_threshold_qty"])

    def test_duplicate_is_blocked(self):
        result, _, _ = _evaluate(sample_csv(duplicate=True), EmptyDB())
        self.assertTrue(result["blocked"])

    def test_invalid_category_or_negative_quantity_block(self):
        for value in [sample_csv(category="NOT_ALLOWED"), sample_csv(minimum="-5")]:
            result, _, _ = _evaluate(value, EmptyDB())
            self.assertTrue(result["blocked"])

    def test_invalid_expiry_days_block(self):
        for value in ["90.5", "not numeric", "-10"]:
            result, _, _ = _evaluate(sample_csv(days=value), EmptyDB())
            self.assertTrue(result["blocked"])


if __name__ == "__main__":
    unittest.main()
