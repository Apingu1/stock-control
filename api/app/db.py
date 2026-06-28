"""api/app/db.py

Phase 2 (DB Tools): dynamic dataset switching.

Instead of binding SQLAlchemy to a single DB_NAME at import time, we select the
globally active dataset per request using /backups/active_dataset.json.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Dict

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "bmr")
DB_PASSWORD = os.getenv("DB_PASSWORD", "bmrpass")

# Default dataset if active_dataset.json is missing/invalid.
DEFAULT_DB_NAME = os.getenv("DB_NAME", "bmr")


def _backup_dir_container() -> Path:
    p = Path(os.getenv("BACKUP_DIR", "/backups")).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def _active_dataset_path() -> Path:
    return _backup_dir_container() / "active_dataset.json"


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
