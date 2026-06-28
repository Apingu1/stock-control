from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ..db import get_active_db_name, get_db
from ..models import User
from ..security import require_admin_access

router = APIRouter(prefix="/admin/db-tools", tags=["admin", "db-tools"])


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _safe_env(name: str, default: str = "") -> str:
    v = os.getenv(name, default) or default
    return str(v)


def _backup_dir_container() -> Path:
    """Container path where backups & state are stored (e.g. /backups)."""
    p = Path(_safe_env("BACKUP_DIR", "/backups")).resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


def _backup_dir_label() -> str:
    """Human-friendly host path label for UI display (does not affect storage)."""
    return _safe_env("BACKUP_DIR_LABEL", "./backups (host bind mount)")


def _state_path(name: str) -> Path:
    return _backup_dir_container() / name


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _audit_log_path() -> Path:
    # Keep existing filename if present; otherwise create it.
    p1 = _state_path("admin_db_tools_audit.jsonl")
    p2 = _state_path("db_tools_audit.jsonl")
    return p1 if p1.exists() else p2


def _audit_write(actor: str, action: str, params: Dict[str, Any], result: str, error: Optional[str] = None) -> None:
    line = {
        "timestamp_utc": _utc_now_iso(),
        "actor": actor,
        "action": action,
        "params": params,
        "result": result,
        "error": error,
    }
    p = _audit_log_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(line) + "\n")


def _sanitize_host(host: str) -> str:
    h = (host or "").strip()
    if not h:
        return "—"
    if h == "db":
        return "db"
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", h):
        parts = h.split(".")
        return f"{parts[0]}.{parts[1]}.x.x"
    if len(h) <= 6:
        return "***"
    return f"{h[:3]}***{h[-2:]}"


def _backup_manifest_path(dump_path: Path) -> Path:
    return dump_path.with_suffix(dump_path.suffix + ".json")


def _read_manifest(p: Path) -> Optional[Dict[str, Any]]:
    try:
        with p.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _assert_safe_backup_filename(filename: str) -> Path:
    """Prevent path traversal; allow only files directly under BACKUP_DIR."""
    bdir = _backup_dir_container()
    name = (filename or "").strip()
    if not name or "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = (bdir / name).resolve()
    if path.parent != bdir:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return path


def _dataset_name_regex() -> re.Pattern:
    # Conservative default: stock*, but configurable.
    pat = _safe_env("DATASET_DB_REGEX", r"^stock[0-9A-Za-z_]*$")
    try:
        return re.compile(pat)
    except Exception:
        return re.compile(r"^stock[0-9A-Za-z_]*$")


def _assert_safe_dataset_name(db_name: str) -> str:
    name = (db_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="db_name is required")
    if name in {"postgres", "template0", "template1"}:
        raise HTTPException(status_code=400, detail="db_name is not allowed")
    if not _dataset_name_regex().match(name):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid database name. Must start with 'stock' and contain only letters, "
                "numbers, or underscore (_). Example: stock_training_202602. "
                "Hyphens (-) and spaces are not allowed."
            ),
        )
    return name


def _postgres_admin_engine() -> Engine:
    """Engine connected to the cluster admin DB (postgres)."""
    host = _safe_env("DB_HOST", "db")
    port = _safe_env("DB_PORT", "5432")
    user = _safe_env("DB_USER", "")
    pw = _safe_env("DB_PASSWORD", "")
    if not user:
        raise HTTPException(status_code=500, detail="DB_USER not configured")
    url = f"postgresql://{user}:{pw}@{host}:{port}/postgres"
    return create_engine(url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)


def _maintenance_path() -> Path:
    return _state_path("maintenance.json")


def get_maintenance_state() -> Dict[str, Any]:
    d = _read_json(
        _maintenance_path(),
        {
            "enabled": False,
            "reason": "",
            "set_by": "",
            "set_at_utc": "",
        },
    )
    # Ensure keys exist
    return {
        "enabled": bool(d.get("enabled", False)),
        "reason": d.get("reason") or "",
        "set_by": d.get("set_by") or "",
        "set_at_utc": d.get("set_at_utc") or "",
    }


def set_maintenance_state(enabled: bool, by: str, reason: str) -> Dict[str, Any]:
    payload = {
        "enabled": bool(enabled),
        "reason": (reason or "").strip(),
        "set_by": by,
        "set_at_utc": _utc_now_iso(),
    }
    _write_json(_maintenance_path(), payload)
    return payload


@router.get("/maintenance")
def maintenance_status_public() -> Dict[str, Any]:
    """Public read-only endpoint so the UI can display a banner to all users."""
    return get_maintenance_state()


@router.post("/maintenance")
def maintenance_toggle(
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    enabled = bool(payload.get("enabled", False))
    reason = (payload.get("reason") or "").strip()
    state = set_maintenance_state(enabled=enabled, by=admin.username, reason=reason)
    _audit_write(
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
    """Read-only system + DB info for Settings page (Admin only)."""
    db_host = _safe_env("DB_HOST", "db")
    db_port = _safe_env("DB_PORT", "5432")
    db_user = _safe_env("DB_USER", "—")
    db_name = get_active_db_name()

    backup_dir_container = str(_backup_dir_container())
    backup_dir_label = _backup_dir_label()

    # DB queries (read-only)
    try:
        pg_version = db.execute(text("SHOW server_version")).scalar()
    except Exception:
        pg_version = None

    try:
        size_bytes = db.execute(text("SELECT pg_database_size(current_database())")).scalar()
    except Exception:
        size_bytes = None

    return {
        "app": {"version": _safe_env("APP_VERSION", "—"), "timezone": _safe_env("TZ", "—")},
        "database": {
            "host": _sanitize_host(db_host),
            "port": db_port,
            "name": db_name,
            "user": db_user if db_user else "—",
            "postgres_version": pg_version or "—",
            "size_bytes": int(size_bytes) if size_bytes else None,
        },
        "backups": {
            "backup_dir_container": backup_dir_container,
            "backup_dir_label": backup_dir_label,
        },
        "maintenance": get_maintenance_state(),
        "security": {"requested_by": admin.username, "requested_at_utc": _utc_now_iso()},
    }


@router.get("/backups")
def list_backups(admin: User = Depends(require_admin_access)) -> Dict[str, Any]:
    """Lists backups in BACKUP_DIR (Admin only)."""
    bdir = _backup_dir_container()
    dumps = sorted(bdir.glob("*.dump"), key=lambda x: x.stat().st_mtime, reverse=True)

    items: List[Dict[str, Any]] = []
    for dump in dumps:
        stat = dump.stat()
        manifest = _read_manifest(_backup_manifest_path(dump))
        items.append(
            {
                "filename": dump.name,
                "size_bytes": stat.st_size,
                "modified_at_utc": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                .replace(microsecond=0)
                .isoformat(),
                "manifest": manifest,
            }
        )

    return {
        "backup_dir_container": str(bdir),
        "backup_dir_label": _backup_dir_label(),
        "count": len(items),
        "items": items,
        "requested_by": admin.username,
        "requested_at_utc": _utc_now_iso(),
    }


@router.get("/backup/{filename}/download")
def download_backup(
    filename: str,
    admin: User = Depends(require_admin_access),
):
    """Stream a .dump backup file (Admin only)."""
    path = _assert_safe_backup_filename(filename)
    if path.suffix != ".dump" or not path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    _audit_write(
        actor=admin.username,
        action="BACKUP_DOWNLOADED",
        params={"filename": filename},
        result="SUCCESS",
    )
    return FileResponse(
        str(path),
        media_type="application/octet-stream",
        filename=path.name,
    )


@router.get("/backup/{filename}/manifest")
def download_manifest(
    filename: str,
    admin: User = Depends(require_admin_access),
) -> JSONResponse:
    """Return the JSON manifest for a given .dump (Admin only)."""
    dump_path = _assert_safe_backup_filename(filename)
    if dump_path.suffix != ".dump" or not dump_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    mpath = _backup_manifest_path(dump_path)
    if not mpath.exists():
        raise HTTPException(status_code=404, detail="Manifest not found")
    try:
        data = json.loads(mpath.read_text(encoding="utf-8"))
    except Exception:
        raise HTTPException(status_code=500, detail="Manifest unreadable")

    return JSONResponse(content=data)


@router.post("/backup")
def create_backup(
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    """Create pg_dump custom-format backup into BACKUP_DIR (Admin only)."""
    bdir = _backup_dir_container()

    db_host = _safe_env("DB_HOST", "db")
    db_port = _safe_env("DB_PORT", "5432")
    db_name = get_active_db_name()
    db_user = _safe_env("DB_USER", "")
    db_password = _safe_env("DB_PASSWORD", "")

    if not db_name or not db_user:
        raise HTTPException(status_code=500, detail="DB_NAME/DB_USER not configured")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    fname = f"stock_control_{db_name}_{stamp}.dump"
    dump_path = bdir / fname

    manifest = {
        "filename": fname,
        "created_at_utc": _utc_now_iso(),
        "created_by": admin.username,
        "db": {"host": db_host, "port": db_port, "name": db_name, "user": db_user},
        "app_version": _safe_env("APP_VERSION", "—"),
        "schema_version": _safe_env("SCHEMA_VERSION", "—"),
        "backup_dir_container": str(bdir),
        "backup_dir_label": _backup_dir_label(),
        "result": "STARTED",
    }

    env = os.environ.copy()
    env["PGPASSWORD"] = db_password

    cmd = [
        "pg_dump",
        "-h",
        db_host,
        "-p",
        str(db_port),
        "-U",
        db_user,
        "-d",
        db_name,
        "-F",
        "c",
        "-f",
        str(dump_path),
    ]

    _audit_write(actor=admin.username, action="BACKUP_CREATE", params={"db": db_name, "filename": fname}, result="STARTED")

    try:
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=60 * 20)
        if proc.returncode != 0:
            manifest["result"] = "FAILED"
            manifest["error"] = (proc.stderr or proc.stdout or "pg_dump failed").strip()[:4000]
            _backup_manifest_path(dump_path).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            _audit_write(
                actor=admin.username,
                action="BACKUP_CREATE",
                params={"db": db_name, "filename": fname},
                result="FAILED",
                error=manifest["error"],
            )
            raise HTTPException(status_code=500, detail=f"Backup failed: {manifest['error']}")
    except subprocess.TimeoutExpired:
        manifest["result"] = "FAILED"
        manifest["error"] = "pg_dump timed out"
        _backup_manifest_path(dump_path).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        _audit_write(actor=admin.username, action="BACKUP_CREATE", params={"db": db_name, "filename": fname}, result="FAILED", error=manifest["error"])
        raise HTTPException(status_code=500, detail="Backup timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="pg_dump not found in API container (install postgresql-client)")
    except HTTPException:
        raise
    except Exception as e:
        manifest["result"] = "FAILED"
        manifest["error"] = str(e)[:4000]
        _backup_manifest_path(dump_path).write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        _audit_write(actor=admin.username, action="BACKUP_CREATE", params={"db": db_name, "filename": fname}, result="FAILED", error=manifest["error"])
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")

    stat = dump_path.stat()
    manifest["result"] = "SUCCESS"
    manifest["size_bytes"] = stat.st_size
    manifest["completed_at_utc"] = _utc_now_iso()
    _backup_manifest_path(dump_path).write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    _audit_write(actor=admin.username, action="BACKUP_CREATE", params={"db": db_name, "filename": fname}, result="SUCCESS")
    return {"message": "Backup created", "backup": manifest}


@router.get("/datasets")
def list_datasets(admin: User = Depends(require_admin_access)) -> Dict[str, Any]:
    """List available dataset DBs in this Postgres cluster (Admin only)."""
    active = get_active_db_name()
    regex = _dataset_name_regex()

    eng = _postgres_admin_engine()
    try:
        with eng.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT datname
                    FROM pg_database
                    WHERE datistemplate = false
                    ORDER BY datname
                    """
                )
            ).fetchall()
    finally:
        eng.dispose()

    names = [r[0] for r in rows]
    allowed = [n for n in names if regex.match(n) and n not in {"postgres", "template0", "template1"}]

    return {
        "active_db": active,
        "datasets": allowed,
        "pattern": regex.pattern,
        "requested_by": admin.username,
        "requested_at_utc": _utc_now_iso(),
    }


@router.post("/datasets/switch")
def switch_dataset(
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    """Switch globally active dataset (Admin only)."""
    db_name = _assert_safe_dataset_name(payload.get("db_name") or "")
    note = (payload.get("audit_note") or "").strip()
    confirm = (payload.get("confirm_phrase") or "").strip()
    if confirm != db_name:
        raise HTTPException(status_code=400, detail="Confirm phrase must exactly match the target dataset name")

    # Ensure DB exists and is allowed
    eng = _postgres_admin_engine()
    try:
        with eng.connect() as conn:
            exists = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name}).scalar()
    finally:
        eng.dispose()
    if not exists:
        raise HTTPException(status_code=404, detail="Dataset DB not found")

    prev = get_active_db_name()
    _write_json(_state_path("active_dataset.json"), {"db_name": db_name, "set_by": admin.username, "set_at_utc": _utc_now_iso(), "note": note})

    _audit_write(
        actor=admin.username,
        action="DATASET_SWITCH",
        params={"from": prev, "to": db_name, "note": note},
        result="SUCCESS",
    )

    return {"active_db": db_name, "previous_db": prev, "set_by": admin.username, "set_at_utc": _utc_now_iso()}


@router.post("/restore")
def restore_backup_into_new_dataset(
    payload: Dict[str, Any] = Body(...),
    admin: User = Depends(require_admin_access),
) -> Dict[str, Any]:
    """Restore a .dump into a NEW dataset DB (Admin only).

    Safeguards:
    - Requires confirm_phrase == "RESTORE"
    - Automatically enables maintenance mode for duration of restore
    - Writes audit events for start/success/failure
    """

    backup_filename = (payload.get("backup_filename") or "").strip()
    new_db_name_raw = (payload.get("new_db_name") or "").strip()
    audit_note = (payload.get("audit_note") or "").strip()
    confirm = (payload.get("confirm_phrase") or "").strip()

    if confirm != "RESTORE":
        raise HTTPException(status_code=400, detail='confirm_phrase must be exactly "RESTORE"')

    dump_path = _assert_safe_backup_filename(backup_filename)
    if dump_path.suffix != ".dump" or not dump_path.exists():
        raise HTTPException(status_code=404, detail="Backup not found")

    # Auto-generate DB name if not provided.
    if not new_db_name_raw:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
        base = "stock_training" if "training" in audit_note.lower() else "stock_restore"
        new_db_name_raw = f"{base}_{stamp}"
    new_db_name = _assert_safe_dataset_name(new_db_name_raw)

    # Maintenance ON
    set_maintenance_state(True, by=admin.username, reason=f"DB restore: {audit_note}".strip())

    db_host = _safe_env("DB_HOST", "db")
    db_port = _safe_env("DB_PORT", "5432")
    db_user = _safe_env("DB_USER", "")
    db_password = _safe_env("DB_PASSWORD", "")
    if not db_user:
        set_maintenance_state(True, by=admin.username, reason="DB restore failed: DB_USER not configured")
        raise HTTPException(status_code=500, detail="DB_USER not configured")

    _audit_write(
        actor=admin.username,
        action="RESTORE_START",
        params={"backup": backup_filename, "new_db": new_db_name, "note": audit_note},
        result="STARTED",
    )

    eng = _postgres_admin_engine()
    try:
        with eng.connect() as conn:
            exists = conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": new_db_name}).scalar()
            if exists:
                raise HTTPException(status_code=409, detail="Target database already exists")

            # Create DB owned by DB_USER
            conn.execute(text(f'CREATE DATABASE "{new_db_name}" OWNER "{db_user}"'))
    finally:
        eng.dispose()

    env = os.environ.copy()
    env["PGPASSWORD"] = db_password

    restore_cmd = [
        "pg_restore",
        "-h",
        db_host,
        "-p",
        str(db_port),
        "-U",
        db_user,
        "-d",
        new_db_name,
        "--no-owner",
        "--no-privileges",
        str(dump_path),
    ]

    try:
        proc = subprocess.run(restore_cmd, env=env, capture_output=True, text=True, timeout=60 * 40)

        restore_warning: Optional[str] = None
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "pg_restore failed").strip()[:4000]

            # Known harmless warning when dump was created by newer pg_dump:
            # "unrecognized configuration parameter \"transaction_timeout\""
            # The restore can still be usable; we will run sanity checks before deciding.
            if 'unrecognized configuration parameter "transaction_timeout"' in err:
                restore_warning = err
            else:
                _audit_write(
                    actor=admin.username,
                    action="RESTORE_COMPLETE",
                    params={"backup": backup_filename, "new_db": new_db_name},
                    result="FAILED",
                    error=err,
                )
                # Keep maintenance ON (explicit operator action to disable)
                raise HTTPException(status_code=500, detail=f"Restore failed: {err}")
            
    except subprocess.TimeoutExpired:
        _audit_write(
            actor=admin.username,
            action="RESTORE_COMPLETE",
            params={"backup": backup_filename, "new_db": new_db_name},
            result="FAILED",
            error="pg_restore timed out",
        )
        raise HTTPException(status_code=500, detail="Restore timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="pg_restore not found in API container (install postgresql-client)")

    # Quick sanity check: can connect and see at least one known table.
    sanity_ok = False
    sanity_err = None
    try:
        url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{new_db_name}"
        test_eng = create_engine(url, pool_pre_ping=True)
        with test_eng.connect() as conn:
            conn.execute(text("SELECT 1"))
            # materials table should exist
            conn.execute(text("SELECT 1 FROM information_schema.tables WHERE table_name='materials' LIMIT 1"))
        test_eng.dispose()
        sanity_ok = True
    except Exception as e:
        sanity_err = str(e)[:4000]

    if not sanity_ok:
        _audit_write(
            actor=admin.username,
            action="RESTORE_COMPLETE",
            params={"backup": backup_filename, "new_db": new_db_name},
            result="FAILED",
            error=f"Sanity check failed: {sanity_err}",
        )
        # Keep maintenance ON
        raise HTTPException(status_code=500, detail=f"Restore sanity check failed: {sanity_err}")

    _audit_write(
    actor=admin.username,
    action="RESTORE_COMPLETE",
    params={"backup": backup_filename, "new_db": new_db_name, "note": audit_note},
    result="SUCCESS_WITH_WARNINGS" if restore_warning else "SUCCESS",
    error=restore_warning,
)

# Maintenance OFF (restore succeeded enough to pass sanity)
    set_maintenance_state(False, by=admin.username, reason=f"Restore complete: {new_db_name}")

    return {
        "ok": True,
        "backup": backup_filename,
        "new_db": new_db_name,
        "restored_by": admin.username,
        "restored_at_utc": _utc_now_iso(),
        "warnings": restore_warning,
    }
