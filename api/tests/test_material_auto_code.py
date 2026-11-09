"""Regression tests for material codes after materials-only data migration."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.routers.materials import _next_material_code, create_material, preview_next_material_code
from app.routers import materials_enhanced
from app.main import app
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


class ActiveMaterialRoutingTests(unittest.TestCase):
    """Verify the registered FastAPI routes, not only unused legacy helpers."""

    def test_actual_live_create_and_preview_routes_use_enhanced_handlers(self):
        get_route = next(r for r in app.routes
                         if getattr(r, "path", None) == "/materials/next-code"
                         and "GET" in getattr(r, "methods", set()))
        post_route = next(r for r in app.routes
                          if getattr(r, "path", None) == "/materials/"
                          and "POST" in getattr(r, "methods", set()))
        self.assertIs(get_route.endpoint, materials_enhanced.preview_next_material_code)
        self.assertIs(post_route.endpoint, materials_enhanced.create_material_with_automatic_code)

    def test_live_preview_after_322_imported_codes(self):
        db = Mock()
        db.execute.return_value.scalar_one.return_value = 322
        self.assertEqual(
            materials_enhanced.preview_next_material_code(db=db, _=SimpleNamespace()),
            {"material_code": "MAT0323"},
        )
        self.assertIn("MAX(SUBSTRING(material_code FROM 4)::BIGINT)",
                      str(db.execute.call_args.args[0]))
        self.assertNotIn("material_code_seq", str(db.execute.call_args.args[0]))

    def test_live_allocator_serializes_and_advances_past_migration(self):
        db = Mock()
        db.execute.return_value.scalar_one.return_value = 322
        self.assertEqual(materials_enhanced._allocate_material_code(db), "MAT0323")
        self.assertEqual(db.execute.call_count, 2)
        self.assertIn("pg_advisory_xact_lock", str(db.execute.call_args_list[0].args[0]))
        self.assertIn("MAX(SUBSTRING", str(db.execute.call_args_list[1].args[0]))
        for call in db.execute.call_args_list:
            self.assertNotIn("nextval", str(call.args[0]))

    @patch("app.routers.materials_enhanced._ensure_lookup_exists")
    def test_live_post_ignores_stale_preview_and_client_supplied_code(self, _):
        db = Mock()
        db.execute.return_value.scalar_one.return_value = 322
        body = materials_enhanced.AutoMaterialCreate(
            material_code="MAT0026",
            name="New test material",
            category_code="SOLID_RAW_MAT",
            type_code="API",
            base_uom_code="G",
        )
        row = materials_enhanced.create_material_with_automatic_code(
            body=body, db=db, user=SimpleNamespace(username="admin")
        )
        self.assertEqual(row.material_code, "MAT0323")
        self.assertEqual(db.execute.call_count, 2)
        db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
