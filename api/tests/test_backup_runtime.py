from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app import backup_scheduler, db_tool_state
from app.routers.admin_db_tools import (
    _only_transaction_timeout_compatibility_error,
    upload_backup,
)
from app.services import backup_service
from starlette.requests import Request


class BackupRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.backups = root / "backups"
        self.state = root / "state"
        self.environment = patch.dict(
            os.environ,
            {
                "BACKUP_DIR": str(self.backups),
                "APP_STATE_DIR": str(self.state),
                "BACKUP_DIR_LABEL": r"D:\Stock Control\Backups",
                "TZ": "UTC",
            },
            clear=False,
        )
        self.environment.start()

    def tearDown(self) -> None:
        self.environment.stop()
        self.temporary.cleanup()

    def test_schedule_can_be_saved_and_changed(self) -> None:
        first = db_tool_state.save_backup_settings(
            {"enabled": True, "time_local": "01:45", "retention_days": 21},
            actor="admin",
        )
        second = db_tool_state.save_backup_settings(
            {"enabled": False, "time_local": "23:10", "retention_days": 90},
            actor="admin",
        )

        self.assertEqual(first["time_local"], "01:45")
        self.assertFalse(second["enabled"])
        self.assertEqual(second["time_local"], "23:10")
        self.assertEqual(second["retention_days"], 90)
        self.assertIsNone(db_tool_state.next_scheduled_run(second))
        persisted = json.loads((self.state / "backup_settings.json").read_text(encoding="utf-8"))
        self.assertEqual(persisted["updated_by"], "admin")

    def test_legacy_runtime_state_is_migrated_out_of_backup_folder(self) -> None:
        self.backups.mkdir(parents=True)
        legacy = self.backups / "active_dataset.json"
        legacy.write_text('{"db_name":"stock_restore_legacy"}', encoding="utf-8")

        migrated = db_tool_state.state_path("active_dataset.json")

        self.assertEqual(migrated.parent, self.state.resolve())
        self.assertEqual(json.loads(migrated.read_text(encoding="utf-8"))["db_name"], "stock_restore_legacy")
        self.assertTrue(legacy.exists())

    def test_retention_removes_only_expired_automatic_backups(self) -> None:
        self.backups.mkdir(parents=True)
        old_time = (datetime.now(timezone.utc) - timedelta(days=31)).timestamp()
        auto = self.backups / "StockControl_Auto_2026-01-01_02-30-00.dump"
        manual = self.backups / "StockControl_Manual_2026-01-01_12-00-00.dump"
        for path, kind in ((auto, "AUTO"), (manual, "MANUAL")):
            path.write_bytes(b"PGDMPtest")
            db_tool_state.write_json_atomic(
                db_tool_state.backup_manifest_path(path),
                {"backup_type": kind, "sha256": backup_service.sha256_file(path)},
            )
            os.utime(path, (old_time, old_time))

        result = backup_service.prune_automatic_backups(30)

        self.assertEqual(result, {"removed": 1, "failed": 0})
        self.assertFalse(auto.exists())
        self.assertTrue(manual.exists())
        self.assertTrue(db_tool_state.backup_manifest_path(manual).exists())

    def test_scheduler_runs_once_for_a_due_local_date(self) -> None:
        db_tool_state.save_backup_settings(
            {"enabled": True, "time_local": "00:00", "timezone": "UTC", "retention_days": 30},
            actor="admin",
        )
        manifest = {
            "filename": "StockControl_Auto_2026-01-01_00-00-00.dump",
            "completed_at_utc": datetime.now(timezone.utc).isoformat(),
        }
        with patch.object(backup_scheduler, "create_backup", return_value=manifest) as create:
            self.assertTrue(backup_scheduler.run_due_backup())
            self.assertFalse(backup_scheduler.run_due_backup())

        create.assert_called_once()
        status = db_tool_state.scheduler_status()
        self.assertEqual(status["last_result"], "SUCCESS")
        self.assertEqual(status["last_filename"], manifest["filename"])

    def test_restore_compatibility_warning_does_not_hide_other_errors(self) -> None:
        known_only = "\n".join(
            (
                'pg_restore: error: could not execute query: ERROR: unrecognized configuration parameter "transaction_timeout"',
                "Command was: SET transaction_timeout = 0;",
                "pg_restore: warning: errors ignored on restore: 1",
            )
        )
        mixed = known_only + "\npg_restore: error: relation materials already exists"

        self.assertTrue(_only_transaction_timeout_compatibility_error(known_only))
        self.assertFalse(_only_transaction_timeout_compatibility_error(mixed))

    def test_raw_upload_streams_into_configured_backup_folder(self) -> None:
        content = b"PGDMP" + (b"backup-content" * 100)
        messages = iter(
            (
                {"type": "http.request", "body": content[:500], "more_body": True},
                {"type": "http.request", "body": content[500:], "more_body": False},
            )
        )

        async def receive():
            return next(messages)

        request = Request(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/admin/db-tools/backup/upload",
                "raw_path": b"/admin/db-tools/backup/upload",
                "query_string": b"",
                "headers": [
                    (b"content-length", str(len(content)).encode("ascii")),
                    (b"x-backup-filename", b"selected%20physical%20backup.dump"),
                ],
                "client": ("127.0.0.1", 1234),
                "server": ("testserver", 80),
            },
            receive,
        )

        result = asyncio.run(upload_backup(request=request, admin=SimpleNamespace(username="admin")))

        filename = result["backup"]["filename"]
        stored = self.backups / filename
        self.assertTrue(stored.exists())
        self.assertEqual(stored.read_bytes(), content)
        self.assertEqual(result["backup"]["original_filename"], "selected physical backup.dump")
        self.assertEqual(result["backup"]["backup_type"], "IMPORTED")
        self.assertTrue(db_tool_state.backup_manifest_path(stored).exists())


if __name__ == "__main__":
    unittest.main()
