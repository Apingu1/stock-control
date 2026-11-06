"""Regression tests for material codes after materials-only data migration."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.routers.materials import _next_material_code, create_material, preview_next_material_code
from app.schemas import MaterialCreate


def sample_material(code=None):
    return MaterialCreate(
        material_code=code,
        name="Test API",
        category_code="SOLID_RAW_MAT",
        type_code="API",
        base_uom_code="G",
    )


class MaterialAutoCodeTests(unittest.TestCase):
    def test_new_material_payload_accepts_omitted_or_null_code(self):
        data = sample_material().model_dump()
        self.assertIsNone(data["material_code"])
        self.assertIsNone(sample_material(None).material_code)

    def test_next_code_uses_numeric_max_from_existing_migration(self):
        session = Mock()
        for highest, expected in [(0, "MAT0001"), (322, "MAT0323"), (9999, "MAT10000")]:
            with self.subTest(highest=highest):
                session.execute.return_value.scalar_one.return_value = highest
                self.assertEqual(_next_material_code(session), expected)
        sql = str(session.execute.call_args.args[0])
        self.assertIn("MAX(SUBSTRING(material_code FROM 4)::BIGINT)", sql)
        self.assertIn("material_code ~ '^MAT[0-9]+$'", sql)

    def test_preview_uses_live_database(self):
        session = Mock()
        session.execute.return_value.scalar_one.return_value = 322
        self.assertEqual(
            preview_next_material_code(db=session, _=SimpleNamespace()),
            {"material_code": "MAT0323"},
        )

    @patch("app.routers.materials._ensure_lookup_exists")
    def test_create_allocates_code_inside_serialized_transaction(self, _):
        session = Mock()
        session.execute.return_value.scalar_one.return_value = 322
        result = create_material(
            body=sample_material(),
            db=session,
            user=SimpleNamespace(username="admin"),
        )
        self.assertEqual(result.material_code, "MAT0323")
        self.assertEqual(session.execute.call_count, 2)
        lock_sql = str(session.execute.call_args_list[0].args[0])
        self.assertIn("pg_advisory_xact_lock", lock_sql)
        session.commit.assert_called_once()

    @patch("app.routers.materials._ensure_lookup_exists")
    def test_explicit_legacy_code_still_accepted(self, _):
        session = Mock()
        result = create_material(
            body=sample_material("MAT9001"),
            db=session,
            user=SimpleNamespace(username="admin"),
        )
        self.assertEqual(result.material_code, "MAT9001")
        session.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
