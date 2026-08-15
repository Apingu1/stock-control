from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from jose import jwt

from app.security import (
    ACCESS_TOKEN_PURPOSE,
    DEFAULT_INACTIVITY_TIMEOUT_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET,
    create_access_token,
    get_inactivity_timeout_minutes,
)


class SessionSecurityTests(unittest.TestCase):
    def test_access_token_is_bound_to_a_server_session_and_purpose(self) -> None:
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        token = create_access_token(
            sub="operator1",
            role="OPERATOR",
            session_id="session-123",
            purpose=ACCESS_TOKEN_PURPOSE,
            expires_at=expires_at,
        )

        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        self.assertEqual(payload["sub"], "operator1")
        self.assertEqual(payload["sid"], "session-123")
        self.assertEqual(payload["purpose"], ACCESS_TOKEN_PURPOSE)

    def test_timeout_setting_falls_back_and_is_clamped(self) -> None:
        missing_db = MagicMock()
        missing_db.query.return_value.filter.return_value.one_or_none.return_value = None
        self.assertEqual(
            get_inactivity_timeout_minutes(missing_db),
            DEFAULT_INACTIVITY_TIMEOUT_MINUTES,
        )

        high_db = MagicMock()
        high_db.query.return_value.filter.return_value.one_or_none.return_value = SimpleNamespace(
            inactivity_timeout_minutes=999
        )
        self.assertEqual(get_inactivity_timeout_minutes(high_db), 120)

    def test_migration_enrols_existing_users_and_creates_session_controls(self) -> None:
        root = Path(__file__).resolve().parents[2]
        migration = (root / "db/init/127_session_security_controls.sql").read_text(
            encoding="utf-8"
        )
        self.assertIn("must_change_password BOOLEAN NOT NULL DEFAULT TRUE", migration)
        self.assertIn("CREATE TABLE IF NOT EXISTS auth_sessions", migration)
        self.assertIn("inactivity_timeout_minutes BETWEEN 5 AND 120", migration)


if __name__ == "__main__":
    unittest.main()
