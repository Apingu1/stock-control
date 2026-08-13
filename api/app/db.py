"""api/app/db.py

Phase 2 (DB Tools): dynamic dataset switching.

Instead of binding SQLAlchemy to a single DB_NAME at import time, we select the
globally active dataset per request using persistent application state. Runtime
state is separate from the adjustable backup destination so changing folders
cannot silently switch the application back to the default database.
"""

from __future__ import annotations

import json
import threading
from typing import Dict

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .db_tool_state import safe_env, state_path


DB_HOST = safe_env("DB_HOST", "db")
DB_PORT = safe_env("DB_PORT", "5432")
DB_USER = safe_env("DB_USER", "bmr")
DB_PASSWORD = safe_env("DB_PASSWORD", "bmrpass")

# Default dataset if active_dataset.json is missing/invalid.
DEFAULT_DB_NAME = safe_env("DB_NAME", "bmr")


def _active_dataset_path():
    return state_path("active_dataset.json")


def get_active_db_name() -> str:
    """Read the globally active dataset DB name."""
    p = _active_dataset_path()
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        name = (data.get("db_name") or "").strip()
        return name or DEFAULT_DB_NAME
    except Exception:
        return DEFAULT_DB_NAME


def _make_url(db_name: str) -> str:
    return f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{db_name}"


_engine_lock = threading.Lock()
_sessionmakers: Dict[str, sessionmaker] = {}


def _get_sessionmaker(db_name: str) -> sessionmaker:
    with _engine_lock:
        if db_name in _sessionmakers:
            return _sessionmakers[db_name]

        engine = create_engine(_make_url(db_name), pool_pre_ping=True)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        _sessionmakers[db_name] = SessionLocal
        return SessionLocal


def get_db():
    db_name = get_active_db_name()
    SessionLocal = _get_sessionmaker(db_name)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
