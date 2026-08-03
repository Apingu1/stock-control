from __future__ import annotations

import os

from passlib.hash import bcrypt

from .db import _get_sessionmaker, get_active_db_name
from .models import User


def main() -> None:
    username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "admin").strip() or "admin"
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "Admin123!")

    if len(password) < 8:
        raise RuntimeError("Bootstrap admin password must be at least 8 characters")

    session_local = _get_sessionmaker(get_active_db_name())
    db = session_local()
    try:
        user = db.query(User).filter(User.username == username).one_or_none()
        if user is None:
            user = User(
                username=username,
                password_hash=bcrypt.hash(password),
                role="ADMIN",
                is_active=True,
                created_by="production-bootstrap",
            )
            db.add(user)
        else:
            user.password_hash = bcrypt.hash(password)
            user.role = "ADMIN"
            user.is_active = True

        db.commit()
        print(f"Bootstrap administrator '{username}' is active and password was reset.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
