from __future__ import annotations

import hashlib
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..db import get_active_db_name, get_db
from ..db_tool_state import (
    audit_write,
    backup_dir,
    backup_dir_label,
    backup_manifest_path,
    get_backup_settings,
    next_scheduled_run,
    read_json,
    read_manifest,
    safe_env,
    save_backup_settings,
    scheduler_status,
    state_path,
    utc_now_iso,
    write_json_atomic,
)
from ..models import User
from ..security import require_admin_access
from ..services.backup_service import (
    BackupBusyError,
    BackupError,
    create_backup,
    operation_lock,
    register_imported_backup,
    verify_backup,
)


router = APIRouter(prefix="/admin/db-tools", tags=["admin", "db-tools"])


def _sanitize_host(host: str) -> str:
    candidate = (host or "").strip()
    if not candidate:
        return "—"
    if candidate == "db":
        return "db"
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", candidate):
        parts = candidate.split(".")
        return f"{parts[0]}.{parts[1]}.x.x"
    if len(candidate) <= 6:
        return "***"
    return f"{candidate[:3]}***{candidate[-2:]}"


def _assert_safe_backup_filename(filename: str) -> Path:
    directory = backup_dir()
    name = (filename or "").strip()
    if not name or "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    path = (directory / name).resolve()
    if path.parent != directory or path.suffix.lower() != ".dump":
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    return path


def _dataset_name_regex() -> re.Pattern[str]:
    pattern = safe_env("DATASET_DB_REGEX", r"^stock[0-9A-Za-z_]*$")
    try:
        return re.compile(pattern)
    except re.error:
        return re.compile(r"^stock[0-9A-Za-z_]*$")


def _assert_safe_dataset_name(db_name: str) -> str:
    name = (db_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Database name is required")
    if name in {"postgres", "template0", "template1"} or not _dataset_name_regex().fullmatch(name):
        raise HTTPException(status_code=400, detail="Database name is outside the Stock Control recovery allowlist")
    return name


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _postgres_admin_engine() -> Engine:
    host = safe_env("DB_HOST", "db")
    port = safe_env("DB_PORT", "5432")
    user = safe_env("DB_USER", "")
    password = safe_env("DB_PASSWORD", "")
    if not user:
        raise HTTPException(status_code=500, detail="Database user is not configured")
    return create_engine(
        f"postgresql://{user}:{password}@{host}:{port}/postgres",
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
    )


def _maintenance_path() -> Path:
    return state_path("maintenance.json")


def get_maintenance_state() -> Dict[str, Any]:
    data = read_json(
        _maintenance_path(),
        {"enabled": False, "reason": "", "set_by": "", "set_at_utc": ""},
    )
    if not isinstance(data, dict):
        data = {}
    return {
        "enabled": bool(data.get("enabled", False)),
        "reason": data.get("reason") or "",
        "set_by": data.get("set_by") or "",
        "set_at_utc": data.get("set_at_utc") or "",
    }


def set_maintenance_state(enabled: bool, by: str, reason: str) -> Dict[str, Any]:
    payload = {
        "enabled": bool(enabled),
        "reason": (reason or "").strip(),
        "set_by": by,
        "set_at_utc": utc_now_iso(),
    }
    write_json_atomic(_maintenance_path(), payload)
    return payload


def _settings_response() -> Dict[str, Any]:
    settings = get_backup_settings()
    return {
        **settings,
        "backup_dir_container": str(backup_dir()),
        "backup_dir_label": backup_dir_label(),
        "next_run_at_local": next_scheduled_run(settings),
        "scheduler": scheduler_status(),
    }


@router.get("/maintenance")
def maintenance_status_public() -> Dict[str, Any]:
    return get_maintenance_state()


@router.post("/maintenance")
def maintenance_toggle(
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    enabled = bool(payload.get("enabled", False))
    reason = (payload.get("reason") or "").strip()
    state = set_maintenance_state(enabled=enabled, by=admin.username, reason=reason)
    audit_write(
        actor=admin.username,
        action="MAINTENANCE_SET",
        params={"enabled": enabled, "reason": reason},
        result="SUCCESS",
    )
    return state


@router.get("/system-info")
def system_info(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    try:
        postgres_version = db.execute(text("SHOW server_version")).scalar()
    except Exception:
        postgres_version = None
    try:
        size_bytes = db.execute(text("SELECT pg_database_size(current_database())")).scalar()
    except Exception:
        size_bytes = None
    return {
        "app": {"version": safe_env("APP_VERSION", "—"), "timezone": safe_env("TZ", "—")},
        "database": {
            "host": _sanitize_host(safe_env("DB_HOST", "db")),
            "port": safe_env("DB_PORT", "5432"),
            "name": get_active_db_name(),
            "user": safe_env("DB_USER", "—") or "—",
            "postgres_version": postgres_version or "—",
            "size_bytes": int(size_bytes) if size_bytes else None,
        },
        "backups": {
            "backup_dir_container": str(backup_dir()),
            "backup_dir_label": backup_dir_label(),
        },
        "maintenance": get_maintenance_state(),
        "security": {"requested_by": admin.username, "requested_at_utc": utc_now_iso()},
    }


@router.get("/backup-settings")
def backup_settings(admin: User = Depends(require_admin_access)) -> Dict[str, Any]:
    return _settings_response()


@router.post("/backup-settings")
def update_backup_settings(
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    try:
        save_backup_settings(payload, actor=admin.username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _settings_response()


@router.get("/backups")
def list_backups(admin: User = Depends(require_admin_access)) -> Dict[str, Any]:
    directory = backup_dir()
    dumps = sorted(directory.glob("*.dump"), key=lambda item: item.stat().st_mtime, reverse=True)
    items: List[Dict[str, Any]] = []
    for dump in dumps:
        stat = dump.stat()
        items.append(
            {
                "filename": dump.name,
                "size_bytes": stat.st_size,
                "modified_at_utc": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                .replace(microsecond=0)
                .isoformat(),
                "manifest": read_manifest(dump),
            }
        )
    return {
        "backup_dir_container": str(directory),
        "backup_dir_label": backup_dir_label(),
        "count": len(items),
        "items": items,
        "requested_by": admin.username,
        "requested_at_utc": utc_now_iso(),
    }


@router.get("/backup/{filename}/download")
def download_backup(filename: str, admin: User = Depends(require_admin_access)):
    path = _assert_safe_backup_filename(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    audit_write(
        actor=admin.username,
        action="BACKUP_DOWNLOADED",
        params={"filename": filename},
        result="SUCCESS",
    )
    return FileResponse(str(path), media_type="application/octet-stream", filename=path.name)


@router.get("/backup/{filename}/manifest")
def download_manifest(filename: str, admin: User = Depends(require_admin_access)) -> JSONResponse:
    path = _assert_safe_backup_filename(filename)
    manifest = read_manifest(path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    if manifest is None:
        raise HTTPException(status_code=404, detail="Manifest not found")
    return JSONResponse(content=manifest)


@router.get("/backup/{filename}/verify")
def verify_stored_backup(filename: str, admin: User = Depends(require_admin_access)) -> Dict[str, Any]:
    path = _assert_safe_backup_filename(filename)
    try:
        result = verify_backup(path)
    except BackupError as exc:
        audit_write(
            actor=admin.username,
            action="BACKUP_VERIFY",
            params={"filename": filename},
            result="FAILED",
            error=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    audit_write(
        actor=admin.username,
        action="BACKUP_VERIFY",
        params={"filename": filename, "integrity": result["integrity"]},
        result="SUCCESS",
    )
    return result


@router.post("/backup")
def create_manual_backup(
    payload: Optional[Dict[str, Any]] = Body(default=None),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    reason = str((payload or {}).get("reason") or "Manual administrator backup").strip()
    try:
        manifest = create_backup(actor=admin.username, backup_type="MANUAL", reason=reason)
    except BackupBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except BackupError as exc:
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}") from exc
    return {"message": "Backup created", "backup": manifest}


@router.post("/backup/upload")
async def upload_backup(
    request: Request,
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    encoded_name = request.headers.get("X-Backup-Filename") or "backup.dump"
    original_name = Path(unquote(encoded_name)).name
    if Path(original_name).suffix.lower() != ".dump":
        raise HTTPException(status_code=400, detail="Choose a .dump backup file")
    timezone_name = get_backup_settings()["timezone"]
    stamp = datetime.now(ZoneInfo(timezone_name)).strftime("%Y-%m-%d_%H-%M-%S")
    destination = backup_dir() / f"StockControl_Imported_{stamp}.dump"
    sequence = 1
    while destination.exists() or backup_manifest_path(destination).exists():
        destination = backup_dir() / f"StockControl_Imported_{stamp}_{sequence:02d}.dump"
        sequence += 1
    partial = destination.with_name(f".{destination.name}.uploading")
    maximum = int(safe_env("MAX_BACKUP_UPLOAD_BYTES", str(5 * 1024 * 1024 * 1024)))
    content_length = request.headers.get("Content-Length")
    if content_length:
        try:
            if int(content_length) > maximum:
                raise HTTPException(status_code=413, detail="Selected backup exceeds the configured upload limit")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid upload length")
    digest = hashlib.sha256()
    size = 0
    registered = False
    try:
        with partial.open("wb") as handle:
            async for chunk in request.stream():
                if not chunk:
                    continue
                size += len(chunk)
                if size > maximum:
                    raise HTTPException(status_code=413, detail="Selected backup exceeds the configured upload limit")
                digest.update(chunk)
                await run_in_threadpool(handle.write, chunk)
            await run_in_threadpool(handle.flush)
            await run_in_threadpool(os.fsync, handle.fileno())
        if size == 0:
            raise HTTPException(status_code=400, detail="Selected backup file is empty")
        with partial.open("rb") as handle:
            if handle.read(5) != b"PGDMP":
                raise HTTPException(status_code=400, detail="Selected file is not a PostgreSQL custom-format backup")
        os.replace(partial, destination)
        manifest = register_imported_backup(
            destination,
            actor=admin.username,
            original_filename=original_name,
            sha256=digest.hexdigest(),
        )
        registered = True
        return {"message": "Backup file imported", "backup": manifest}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backup upload failed: {exc}") from exc
    finally:
        try:
            partial.unlink(missing_ok=True)
        except OSError:
            pass
        if not registered:
            for cleanup_path in (destination, backup_manifest_path(destination)):
                try:
                    cleanup_path.unlink(missing_ok=True)
                except OSError:
                    pass


@router.get("/datasets")
def list_datasets(admin: User = Depends(require_admin_access)) -> Dict[str, Any]:
    active = get_active_db_name()
    regex = _dataset_name_regex()
    engine = _postgres_admin_engine()
    try:
        with engine.connect() as connection:
            rows = connection.execute(
                text("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
            ).fetchall()
    finally:
        engine.dispose()
    datasets = [
        row[0]
        for row in rows
        if regex.fullmatch(row[0]) and row[0] not in {"postgres", "template0", "template1"}
    ]
    return {
        "active_db": active,
        "datasets": datasets,
        "pattern": regex.pattern,
        "requested_by": admin.username,
        "requested_at_utc": utc_now_iso(),
    }


@router.post("/datasets/switch")
def switch_dataset(
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    db_name = _assert_safe_dataset_name(str(payload.get("db_name") or ""))
    note = str(payload.get("audit_note") or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="An audit reason is required")
    engine = _postgres_admin_engine()
    try:
        with engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_name}
            ).scalar()
    finally:
        engine.dispose()
    if not exists:
        raise HTTPException(status_code=404, detail="Dataset database not found")
    previous = get_active_db_name()
    write_json_atomic(
        state_path("active_dataset.json"),
        {"db_name": db_name, "set_by": admin.username, "set_at_utc": utc_now_iso(), "note": note},
    )
    audit_write(
        actor=admin.username,
        action="DATASET_SWITCH",
        params={"from": previous, "to": db_name, "note": note},
        result="SUCCESS",
    )
    return {
        "active_db": db_name,
        "previous_db": previous,
        "set_by": admin.username,
        "set_at_utc": utc_now_iso(),
    }


def _new_restore_database_name(connection) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    base = f"stock_restore_{stamp}"
    candidate = base
    sequence = 1
    while connection.execute(
        text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": candidate}
    ).scalar():
        candidate = f"{base}_{sequence:02d}"
        sequence += 1
    return _assert_safe_dataset_name(candidate)


def _drop_recovery_database(db_name: str) -> None:
    engine = _postgres_admin_engine()
    try:
        with engine.connect() as connection:
            connection.execute(
                text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :name"),
                {"name": db_name},
            )
            connection.execute(text(f"DROP DATABASE IF EXISTS {_quote_identifier(db_name)}"))
    finally:
        engine.dispose()


def _restore_sanity_check(db_name: str) -> Dict[str, Any]:
    user = safe_env("DB_USER", "")
    password = safe_env("DB_PASSWORD", "")
    host = safe_env("DB_HOST", "db")
    port = safe_env("DB_PORT", "5432")
    engine = create_engine(f"postgresql://{user}:{password}@{host}:{port}/{db_name}", pool_pre_ping=True)
    required = ("materials", "material_lots", "stock_transactions", "users")
    try:
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT "
                    "to_regclass('public.materials'), "
                    "to_regclass('public.material_lots'), "
                    "to_regclass('public.stock_transactions'), "
                    "to_regclass('public.users')"
                )
            ).one()
            missing = [name for name, value in zip(required, row) if value is None]
            if missing:
                raise BackupError(f"Restored database is missing required tables: {', '.join(missing)}")
            counts = {
                "materials": int(connection.execute(text("SELECT COUNT(*) FROM materials")).scalar() or 0),
                "users": int(connection.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0),
                "stock_transactions": int(
                    connection.execute(text("SELECT COUNT(*) FROM stock_transactions")).scalar() or 0
                ),
            }
            return {"required_tables": list(required), "record_counts": counts}
    finally:
        engine.dispose()


def _apply_current_schema(db_name: str) -> Dict[str, Any]:
    script = Path(safe_env("SCHEMA_BOOTSTRAP_SCRIPT", "/schema/production-bootstrap.sh"))
    if not script.exists():
        raise BackupError("Current schema bootstrap is not available in the API container")
    environment = os.environ.copy()
    environment.update(
        {
            "DB_NAME": db_name,
            "DB_USER": safe_env("DB_USER", ""),
            "DB_PASSWORD": safe_env("DB_PASSWORD", ""),
        }
    )
    process = subprocess.run(
        ["bash", str(script)],
        env=environment,
        capture_output=True,
        text=True,
        timeout=int(safe_env("SCHEMA_BOOTSTRAP_TIMEOUT_SECONDS", "1200")),
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "Schema bootstrap failed").strip()[:4000]
        raise BackupError(f"Restored database schema update failed: {detail}")
    output = (process.stdout or "").strip()
    return {"result": "SUCCESS", "summary": output[-1000:] if output else "Schema is current"}


def _only_transaction_timeout_compatibility_error(output: str) -> bool:
    """Accept the single known newer-pg_dump compatibility statement only."""
    text_output = (output or "").strip()
    if 'unrecognized configuration parameter "transaction_timeout"' not in text_output:
        return False
    allowed_fragments = (
        'unrecognized configuration parameter "transaction_timeout"',
        "Command was: SET transaction_timeout = 0;",
        "errors ignored on restore: 1",
    )
    meaningful_lines = [line.strip() for line in text_output.splitlines() if line.strip()]
    return bool(meaningful_lines) and all(
        any(fragment in line for fragment in allowed_fragments) for line in meaningful_lines
    )


@router.post("/restore")
def restore_backup_and_activate(
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    filename = str(payload.get("backup_filename") or "").strip()
    audit_note = str(payload.get("audit_note") or "").strip()
    if not audit_note:
        raise HTTPException(status_code=400, detail="A restore reason is required")
    dump_path = _assert_safe_backup_filename(filename)
    if not dump_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    previous_db = get_active_db_name()
    previous_maintenance = get_maintenance_state()
    recovery_db: Optional[str] = None
    pre_restore: Optional[Dict[str, Any]] = None
    verification: Optional[Dict[str, Any]] = None
    restore_warning: Optional[str] = None
    try:
        with operation_lock():
            verification = verify_backup(dump_path)
            set_maintenance_state(True, by=admin.username, reason=f"Database restore: {audit_note}")
            pre_restore = create_backup(
                actor=admin.username,
                backup_type="PRE_RESTORE",
                reason=f"Automatic safety backup before restoring {filename}: {audit_note}",
                db_name=previous_db,
                lock_already_held=True,
            )
            admin_engine = _postgres_admin_engine()
            try:
                with admin_engine.connect() as connection:
                    recovery_db = _new_restore_database_name(connection)
                    owner = _quote_identifier(safe_env("DB_USER", ""))
                    connection.execute(text(f"CREATE DATABASE {_quote_identifier(recovery_db)} OWNER {owner}"))
            finally:
                admin_engine.dispose()

            audit_write(
                actor=admin.username,
                action="RESTORE_START",
                params={
                    "backup": filename,
                    "previous_db": previous_db,
                    "new_db": recovery_db,
                    "note": audit_note,
                    "integrity": verification["integrity"],
                    "pre_restore_backup": pre_restore["filename"],
                },
                result="STARTED",
            )
            environment = os.environ.copy()
            environment["PGPASSWORD"] = safe_env("DB_PASSWORD", "")
            command = [
                "pg_restore",
                "--host",
                safe_env("DB_HOST", "db"),
                "--port",
                safe_env("DB_PORT", "5432"),
                "--username",
                safe_env("DB_USER", ""),
                "--dbname",
                recovery_db,
                "--no-owner",
                "--no-privileges",
                "--no-password",
                str(dump_path),
            ]
            process = subprocess.run(
                command,
                env=environment,
                capture_output=True,
                text=True,
                timeout=int(safe_env("RESTORE_TIMEOUT_SECONDS", "2400")),
                check=False,
            )
            if process.returncode != 0:
                detail = (process.stderr or process.stdout or "pg_restore failed").strip()[:4000]
                if _only_transaction_timeout_compatibility_error(detail):
                    restore_warning = detail
                else:
                    raise BackupError(detail)

            schema_bootstrap = _apply_current_schema(recovery_db)
            sanity = _restore_sanity_check(recovery_db)
            write_json_atomic(
                state_path("active_dataset.json"),
                {
                    "db_name": recovery_db,
                    "set_by": admin.username,
                    "set_at_utc": utc_now_iso(),
                    "note": f"Activated automatically after verified restore: {audit_note}",
                    "previous_db": previous_db,
                    "source_backup": filename,
                },
            )
            audit_write(
                actor=admin.username,
                action="RESTORE_COMPLETE",
                params={
                    "backup": filename,
                    "previous_db": previous_db,
                    "new_db": recovery_db,
                    "note": audit_note,
                    "integrity": verification["integrity"],
                    "sanity": sanity,
                    "schema_bootstrap": schema_bootstrap,
                    "pre_restore_backup": pre_restore["filename"],
                },
                result="SUCCESS_WITH_WARNINGS" if restore_warning else "SUCCESS",
                error=restore_warning,
            )
            set_maintenance_state(
                previous_maintenance["enabled"],
                by=admin.username,
                reason=(
                    previous_maintenance["reason"]
                    if previous_maintenance["enabled"]
                    else f"Restore complete: {recovery_db}"
                ),
            )
            return {
                "ok": True,
                "backup": filename,
                "previous_db": previous_db,
                "new_db": recovery_db,
                "active_db": recovery_db,
                "pre_restore_backup": pre_restore["filename"],
                "integrity": verification["integrity"],
                "sanity": sanity,
                "schema_bootstrap": schema_bootstrap,
                "restored_by": admin.username,
                "restored_at_utc": utc_now_iso(),
                "warnings": restore_warning,
            }
    except BackupBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except subprocess.TimeoutExpired as exc:
        error = "Restore timed out"
        if recovery_db:
            try:
                _drop_recovery_database(recovery_db)
            except Exception:
                pass
        set_maintenance_state(
            previous_maintenance["enabled"],
            by=admin.username,
            reason=(
                previous_maintenance["reason"]
                if previous_maintenance["enabled"]
                else "Restore failed; original dataset remains active"
            ),
        )
        audit_write(
            actor=admin.username,
            action="RESTORE_COMPLETE",
            params={"backup": filename, "previous_db": previous_db, "new_db": recovery_db, "note": audit_note},
            result="FAILED",
            error=error,
        )
        raise HTTPException(status_code=500, detail=error) from exc
    except Exception as exc:
        error = str(exc)[:4000]
        if recovery_db:
            try:
                _drop_recovery_database(recovery_db)
            except Exception:
                pass
        set_maintenance_state(
            previous_maintenance["enabled"],
            by=admin.username,
            reason=(
                previous_maintenance["reason"]
                if previous_maintenance["enabled"]
                else "Restore failed; original dataset remains active"
            ),
        )
        audit_write(
            actor=admin.username,
            action="RESTORE_COMPLETE",
            params={"backup": filename, "previous_db": previous_db, "new_db": recovery_db, "note": audit_note},
            result="FAILED",
            error=error,
        )
        raise HTTPException(status_code=500, detail=f"Restore failed: {error}") from exc
