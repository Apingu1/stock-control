"""Pagination contract checks for unbounded operational history."""
import inspect
import unittest
from unittest.mock import Mock, patch

from sqlalchemy.dialects import postgresql

from app.routers import issues, issues_enhanced, lot_balances, materials, products, quarantine, receipts
from app.main import app


class OperationalPaginationTests(unittest.TestCase):
    def test_core_endpoints_support_arbitrarily_later_pages(self):
        for endpoint in (
            materials.list_materials,
            products.list_products,
            receipts.list_receipts,
            issues.list_issues,
            lot_balances.list_lot_balances,
            quarantine.quarantine_log,
        ):
            with self.subTest(endpoint=endpoint.__name__):
                parameter = inspect.signature(endpoint).parameters["offset"]
                self.assertEqual(parameter.default.default, 0)
                self.assertTrue(any(getattr(m, "ge", None) == 0 for m in parameter.default.metadata))

    def test_receipt_query_offsets_after_ordering(self):
        db = Mock()
        db.execute.return_value.all.return_value = []
        self.assertEqual(receipts.list_receipts(limit=100, offset=500, db=db, _=Mock()), [])
        sql = str(db.execute.call_args.args[0].compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )).upper()
        self.assertIn("ORDER BY", sql)
        self.assertIn("OFFSET 500", sql)
        self.assertIn("LIMIT 100", sql)

    def test_consumption_history_merges_then_pages(self):
        db = Mock()
        db.execute.return_value.all.return_value = []
        self.assertEqual(issues.list_issues(limit=100, offset=600, db=db, _=Mock()), [])
        sql = str(db.execute.call_args.args[0].compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )).upper()
        self.assertIn("UNION ALL", sql)
        self.assertIn("CANCELLED", sql)
        self.assertIn("OFFSET 600", sql)
        self.assertIn("LIMIT 100", sql)

    @patch("app.routers.lot_balances._run_auto_quarantine_low_expiry")
    def test_live_lots_sql_has_no_total_ceiling(self, _):
        db = Mock()
        db.execute.return_value.mappings.return_value.all.return_value = []
        result = lot_balances.list_lot_balances(
            db=db, _=Mock(), search=None, material_code=None,
            include_zero=False, limit=200, offset=4000,
        )
        self.assertEqual(result, [])
        sql, params = db.execute.call_args.args
        self.assertIn("OFFSET :offset", sql.text)
        self.assertEqual(params["offset"], 4000)

    def test_product_paging_uses_offset(self):
        db = Mock()
        db.query.return_value.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []
        out = products.list_products(
            q=None, status=None, licence_status=None, line_type=None,
            storage_condition=None, controlled_drug_status=None,
            export_status=None, limit=100, offset=1500, db=db, _=Mock()
        )
        self.assertEqual(out, [])
        db.query.return_value.order_by.return_value.offset.assert_called_once_with(1500)

    def test_quarantine_log_supports_later_pages(self):
        db = Mock()
        db.execute.return_value.all.return_value = []
        out = quarantine.quarantine_log(
            limit=100, offset=500, event_type=None, q=None, db=db, _=Mock()
        )
        self.assertEqual(out, [])
        self.assertEqual(db.execute.call_count, 3)
        first_sql = str(db.execute.call_args_list[0].args[0].compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )).upper()
        self.assertIn("LIMIT 600", first_sql)


class EnhancedConsumptionPaginationTests(unittest.TestCase):
    """Catch integration defects in the endpoint the deployed API actually uses."""

    def test_registered_consumption_get_is_enhanced_handler(self):
        route = next(
            route for route in app.routes
            if getattr(route, "path", None) == "/issues/"
            and "GET" in getattr(route, "methods", set())
        )
        self.assertIs(route.endpoint, issues_enhanced.list_issues_with_customer)

    @patch("app.routers.issues_enhanced.legacy_issues.list_issues", return_value=[])
    def test_enhanced_handler_passes_offset_instead_of_fastapi_query(self, legacy):
        for offset in (0, 500, 1500):
            with self.subTest(offset=offset):
                self.assertEqual(
                    issues_enhanced.list_issues_with_customer(
                        limit=500, offset=offset, db=Mock(), user=Mock()
                    ),
                    [],
                )
                self.assertEqual(legacy.call_args.kwargs["offset"], offset)

    def test_empty_consumption_history_uses_numeric_offset_not_query_object(self):
        db = Mock()
        db.execute.return_value.all.return_value = []
        # Exercise the enhanced handler through the REAL merged history SQL.
        result = issues_enhanced.list_issues_with_customer(
            limit=500, offset=0, db=db, user=Mock()
        )
        self.assertEqual(result, [])
        self.assertEqual(db.execute.call_count, 1)
        compiled = str(db.execute.call_args.args[0].compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )).upper()
        self.assertIn("UNION ALL", compiled)
        self.assertIn("OFFSET 0", compiled)



if __name__ == "__main__":
    unittest.main()
