"""Shared PostgreSQL backup implementation.

All backup entry points use this service so filenames, manifests, SHA-256
verification, active-dataset selection, locking, and retention remain aligned.
"""

from __future__ import annotations

import fcntl
import hashlib
import os
import subprocess
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, Optional
from zoneinfo import ZoneInfo

from ..db import get_active_db_name
from ..db_tool_state import (
    audit_write,
    backup_dir,
    backup_dir_label,
    backup_manifest_path,
    get_backup_settings,
    read_manifest,
    safe_env,
    state_path,
    write_json_atomic,
)


BACKUP_TYPES = {"AUTO", "MANUAL", "PRE_RESTORE", "INITIAL", "IMPORTED"}
FILENAME_LABELS = {
    "AUTO": "Auto",
    "MANUAL": "Manual",
    "PRE_RESTORE": "PreRestore",
    "INITIAL": "Initial",
    "IMPORTED": "Imported",
}


class BackupError(RuntimeError):
    pass


class BackupBusyError(BackupError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def assert_custom_dump(path: Path) -> None:
    try:
        with path.open("rb") as handle:
            signature = handle.read(5)
    except OSError as exc:
        raise BackupError(f"Backup file cannot be read: {exc}") from exc
    if signature != b"PGDMP":
        raise BackupError("Selected file is not a PostgreSQL custom-format backup")


@contextmanager
def operation_lock(blocking: bool = False) -> Iterator[None]:
    """Prevent automatic backup, manual backup, and restore from overlapping."""
    lock_path = state_path("backup_restore.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as handle:
        flags = fcntl.LOCK_EX
        if not blocking:
            flags |= fcntl.LOCK_NB
        try:
            fcntl.flock(handle.fileno(), flags)
        except BlockingIOError as exc:
            raise BackupBusyError("Another backup or restore operation is already running") from exc
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _safe_backup_type(value: str) -> str:
    candidate = str(value or "").strip().upper()
    if candidate not in BACKUP_TYPES:
        raise BackupError("Unsupported backup type")
    return candidate


def _new_filename(backup_type: str) -> str:
    timezone_name = get_backup_settings()["timezone"]
    now_local = datetime.now(ZoneInfo(timezone_name))
    stamp = now_local.strftime("%Y-%m-%d_%H-%M-%S")
    label = FILENAME_LABELS[backup_type]
    candidate = backup_dir() / f"StockControl_{label}_{stamp}.dump"
    sequence = 1
    while candidate.exists() or backup_manifest_path(candidate).exists():
        candidate = backup_dir() / f"StockControl_{label}_{stamp}_{sequence:02d}.dump"
        sequence += 1
    return candidate.name


def _database_environment() -> Dict[str, str]:
    return {
        "host": safe_env("DB_HOST", "db"),
        "port": safe_env("DB_PORT", "5432"),
        "user": safe_env("DB_USER", ""),
        "password": safe_env("DB_PASSWORD", ""),
    }


def _create_backup_unlocked(
    actor: str,
    backup_type: str,
    reason: str,
    db_name: Optional[str] = None,
) -> Dict[str, Any]:
    kind = _safe_backup_type(backup_type)
    if kind == "IMPORTED":
        raise BackupError("Imported backups are registered through the upload service")

    database = _database_environment()
    active_db = db_name or get_active_db_name()
    if not active_db or not database["user"]:
        raise BackupError("Database name or database user is not configured")

    output_dir = backup_dir()
    filename = _new_filename(kind)
    final_path = output_dir / filename
    partial_path = output_dir / f".{filename}.partial"
    manifest_path = backup_manifest_path(final_path)
    timezone_name = get_backup_settings()["timezone"]
    started_at = datetime.now(timezone.utc)

    params = {"db": active_db, "filename": filename, "backup_type": kind, "reason": reason}

    env = os.environ.copy()
    env["PGPASSWORD"] = database["password"]
    command = [
        "pg_dump",
        "--host",
        database["host"],
        "--port",
        database["port"],
        "--username",
        database["user"],
        "--dbname",
        active_db,
        "--format=custom",
        "--no-password",
        "--file",
        str(partial_path),
    ]
    timeout_seconds = int(safe_env("BACKUP_TIMEOUT_SECONDS", "1200"))
    completed = False

    try:
        audit_write(actor=actor, action="BACKUP_CREATE", params=params, result="STARTED")
        partial_path.unlink(missing_ok=True)
        process = subprocess.run(
            command,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        if process.returncode != 0:
            detail = (process.stderr or process.stdout or "pg_dump failed").strip()[:4000]
            raise BackupError(detail)
        if not partial_path.exists() or partial_path.stat().st_size <= 0:
            raise BackupError("pg_dump completed without producing a non-empty backup file")
        assert_custom_dump(partial_path)
        os.replace(partial_path, final_path)

        completed_at = datetime.now(timezone.utc)
        manifest: Dict[str, Any] = {
            "manifest_version": 2,
            "filename": filename,
            "backup_type": kind,
            "reason": (reason or "").strip(),
            "created_at_utc": started_at.replace(microsecond=0).isoformat(),
            "created_at_local": started_at.astimezone(ZoneInfo(timezone_name)).replace(microsecond=0).isoformat(),
            "completed_at_utc": completed_at.replace(microsecond=0).isoformat(),
            "created_by": actor,
            "database": active_db,
            "db": {
                "host": database["host"],
                "port": database["port"],
                "name": active_db,
                "user": database["user"],
            },
            "app_version": safe_env("APP_VERSION", "—"),
            "schema_version": safe_env("SCHEMA_VERSION", "—"),
            "timezone": timezone_name,
            "backup_dir_label": backup_dir_label(),
            "size_bytes": final_path.stat().st_size,
            "sha256": sha256_file(final_path),
            "result": "SUCCESS",
        }
        write_json_atomic(manifest_path, manifest)
        audit_write(actor=actor, action="BACKUP_CREATE", params=params, result="SUCCESS")
        completed = True
        return manifest
    except subprocess.TimeoutExpired as exc:
        error = f"Backup timed out after {timeout_seconds} seconds"
        try:
            audit_write(actor=actor, action="BACKUP_CREATE", params=params, result="FAILED", error=error)
        except OSError:
            pass
        raise BackupError(error) from exc
    except FileNotFoundError as exc:
        error = "pg_dump is not installed in the backup service container"
        try:
            audit_write(actor=actor, action="BACKUP_CREATE", params=params, result="FAILED", error=error)
        except OSError:
            pass
        raise BackupError(error) from exc
    except Exception as exc:
        error = str(exc)[:4000]
        try:
            audit_write(actor=actor, action="BACKUP_CREATE", params=params, result="FAILED", error=error)
        except OSError:
            pass
        if isinstance(exc, BackupError):
            raise
        raise BackupError(error) from exc
    finally:
        try:
            partial_path.unlink(missing_ok=True)
        except OSError:
            pass
        if not completed:
            for cleanup_path in (final_path, manifest_path):
                try:
                    cleanup_path.unlink(missing_ok=True)
                except OSError:
                    pass


def create_backup(
    actor: str,
    backup_type: str = "MANUAL",
    reason: str = "",
    db_name: Optional[str] = None,
    lock_already_held: bool = False,
) -> Dict[str, Any]:
    automatic = str(backup_type).upper() == "AUTO"
    if lock_already_held:
        manifest = _create_backup_unlocked(actor, backup_type, reason, db_name)
        if automatic:
            prune_automatic_backups(get_backup_settings()["retention_days"])
    else:
        with operation_lock():
            manifest = _create_backup_unlocked(actor, backup_type, reason, db_name)
            if automatic:
                prune_automatic_backups(get_backup_settings()["retention_days"])
    return manifest


def verify_backup(path: Path) -> Dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise BackupError("Backup file was not found")
    if path.suffix.lower() != ".dump":
        raise BackupError("Only .dump backup files can be restored")
    assert_custom_dump(path)

    manifest = read_manifest(path)
    actual_hash = sha256_file(path)
    if manifest and manifest.get("sha256"):
        expected_hash = str(manifest["sha256"]).upper()
        if expected_hash != actual_hash:
            raise BackupError("Backup SHA-256 does not match its manifest")
        integrity = "VERIFIED"
    elif manifest:
        integrity = "NO_HASH"
    else:
        integrity = "NO_MANIFEST"
    return {
        "filename": path.name,
        "size_bytes": path.stat().st_size,
        "sha256": actual_hash,
        "integrity": integrity,
        "manifest": manifest,
    }


def register_imported_backup(
    path: Path,
    actor: str,
    original_filename: str,
    sha256: Optional[str] = None,
) -> Dict[str, Any]:
    assert_custom_dump(path)
    now = datetime.now(timezone.utc)
    timezone_name = get_backup_settings()["timezone"]
    manifest = {
        "manifest_version": 2,
        "filename": path.name,
        "backup_type": "IMPORTED",
        "reason": "Imported for restore",
        "created_at_utc": now.replace(microsecond=0).isoformat(),
        "created_at_local": now.astimezone(ZoneInfo(timezone_name)).replace(microsecond=0).isoformat(),
        "completed_at_utc": now.replace(microsecond=0).isoformat(),
        "created_by": actor,
        "original_filename": original_filename,
        "timezone": timezone_name,
        "backup_dir_label": backup_dir_label(),
        "size_bytes": path.stat().st_size,
        "sha256": (sha256 or sha256_file(path)).upper(),
        "result": "SUCCESS",
    }
    write_json_atomic(backup_manifest_path(path), manifest)
    audit_write(
        actor=actor,
        action="BACKUP_IMPORTED",
        params={"filename": path.name, "original_filename": original_filename, "size_bytes": path.stat().st_size},
        result="SUCCESS",
    )
    return manifest


def prune_automatic_backups(retention_days: int) -> Dict[str, int]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(retention_days)))
    removed = 0
    failed = 0
    for dump_path in backup_dir().glob("*.dump"):
        manifest = read_manifest(dump_path) or {}
        is_automatic = (
            str(manifest.get("backup_type") or "").upper() == "AUTO"
            or dump_path.name.startswith("StockControl_Auto_")
        )
        if not is_automatic:
            continue
        try:
            modified = datetime.fromtimestamp(dump_path.stat().st_mtime, tz=timezone.utc)
        except OSError:
            failed += 1
            continue
        if modified >= cutoff:
            continue
        try:
            dump_path.unlink()
            backup_manifest_path(dump_path).unlink(missing_ok=True)
            removed += 1
        except OSError:
            failed += 1
    return {"removed": removed, "failed": failed}
