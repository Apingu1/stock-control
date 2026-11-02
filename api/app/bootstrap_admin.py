from __future__ import annotations

import os
from datetime import datetime, timezone

from passlib.hash import bcrypt

from .db import _get_sessionmaker, get_active_db_name
from .models import AuthSession, User

# Only replace the known schema placeholder on first install. Real administrator
# accounts retain their credentials during upgrades and reinstalls.
SCHEMA_SEEDED_ADMIN_HASH = "$2b$12$C9l2o1mE0pXr7QkYQeO3A.0NwVb0hXG3k7G0b0xG0b0xG0b0xG0b0"


def is_unprovisioned_seed_admin(user: User) -> bool:
    return user.username == "admin" and user.created_by == "system" and user.password_hash == SCHEMA_SEEDED_ADMIN_HASH


def main() -> None:
    username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin").strip() or "admin"
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")

    if len(password) < 8:
        raise RuntimeError("Bootstrap admin password must be at least 8 characters")

    session_local = _get_sessionmaker(get_active_db_name())
    db = session_local()
    try:
        user = db.query(User).filter(User.username == username).one_or_none()
        change = "UNCHANGED"
        if user is None:
            change = "CREATED"
            user = User(
                username=username,
                password_hash=bcrypt.hash(password),
                role="ADMIN",
                is_active=True,
                must_change_password=True,
                created_by="production-bootstrap",
            )
            db.add(user)
        elif os.getenv("BOOTSTRAP_ADMIN_FORCE_RESET") == "1" or is_unprovisioned_seed_admin(user):
            change = "RESET" if os.getenv("BOOTSTRAP_ADMIN_FORCE_RESET") == "1" else "INITIALISED_SCHEMA_SEED"
            user.password_hash = bcrypt.hash(password)
            if change == "INITIALISED_SCHEMA_SEED":
                user.created_by = "production-bootstrap"
            user.role = "ADMIN"
            user.is_active = True
            user.must_change_password = True
            (
                db.query(AuthSession)
                .filter(
                    AuthSession.user_id == user.id,
                    AuthSession.revoked_at.is_(None),
                )
                .update(
                    {AuthSession.revoked_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
            )

        db.commit()
        print(f"Bootstrap administrator '{username}': {change}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
