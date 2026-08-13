"""Persistent state helpers for database backup and recovery controls.

Runtime state is deliberately separated from the configurable backup folder.
Changing the Windows backup destination must never reset the active dataset,
maintenance mode, scheduler settings, or the administrative audit log.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
DEFAULT_BACKUP_TIME = "02:30"
DEFAULT_RETENTION_DAYS = 30


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().replace(microsecond=0).isoformat()


def safe_env(name: str, default: str = "") -> str:
    value = os.getenv(name, default) or default
    return str(value)


def backup_dir() -> Path:
    path = Path(safe_env("BACKUP_DIR", "/backups")).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def backup_dir_label() -> str:
    return safe_env("BACKUP_DIR_LABEL", "Configured server backup folder")


def state_dir() -> Path:
    path = Path(safe_env("APP_STATE_DIR", "/app-state")).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def state_path(name: str) -> Path:
    """Return a state path, copying legacy state from /backups when required."""
    target = state_dir() / name
    if target.exists():
        return target

    legacy = backup_dir() / name
    if legacy != target and legacy.exists() and legacy.is_file():
        temporary = target.with_name(f".{target.name}.{os.getpid()}.{uuid.uuid4().hex}.migration")
        try:
            shutil.copy2(legacy, temporary)
            os.replace(temporary, target)
        except OSError:
            # A migration copy failure must not prevent the application from
            # starting. The caller will use its safe default instead.
            pass
        finally:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
    return target


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return default


def write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass


def audit_log_path() -> Path:
    preferred = state_path("admin_db_tools_audit.jsonl")
    alternative = state_path("db_tools_audit.jsonl")
    return preferred if preferred.exists() else alternative


def audit_write(
    actor: str,
    action: str,
    params: Dict[str, Any],
    result: str,
    error: Optional[str] = None,
) -> None:
    entry = {
        "timestamp_utc": utc_now_iso(),
        "actor": actor,
        "action": action,
        "params": params,
        "result": result,
        "error": error,
    }
    path = audit_log_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def backup_manifest_path(dump_path: Path) -> Path:
    return dump_path.with_suffix(dump_path.suffix + ".json")


def read_manifest(dump_path: Path) -> Optional[Dict[str, Any]]:
    data = read_json(backup_manifest_path(dump_path), None)
    return data if isinstance(data, dict) else None


def default_backup_settings() -> Dict[str, Any]:
    return {
        "enabled": True,
        "time_local": DEFAULT_BACKUP_TIME,
        "timezone": safe_env("TZ", "Europe/London"),
        "retention_days": DEFAULT_RETENTION_DAYS,
        "updated_by": "SYSTEM_DEFAULT",
        "updated_at_utc": "",
    }


def _valid_timezone(name: str) -> str:
    candidate = (name or "").strip() or "Europe/London"
    try:
        ZoneInfo(candidate)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Unknown backup timezone") from exc
    return candidate


def validate_backup_settings(payload: Dict[str, Any], current: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    base = {**default_backup_settings(), **(current or {})}

    enabled = payload.get("enabled", base["enabled"])
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be true or false")

    time_local = str(payload.get("time_local", base["time_local"]) or "").strip()
    if not TIME_PATTERN.fullmatch(time_local):
        raise ValueError("Backup time must use 24-hour HH:MM format")

    try:
        retention_days = int(payload.get("retention_days", base["retention_days"]))
    except (TypeError, ValueError) as exc:
        raise ValueError("Retention days must be a whole number") from exc
    if not 1 <= retention_days <= 3650:
        raise ValueError("Retention days must be between 1 and 3650")

    timezone_name = _valid_timezone(str(payload.get("timezone", base["timezone"])))
    return {
        **base,
        "enabled": enabled,
        "time_local": time_local,
        "timezone": timezone_name,
        "retention_days": retention_days,
    }


def get_backup_settings() -> Dict[str, Any]:
    current = read_json(state_path("backup_settings.json"), {})
    if not isinstance(current, dict):
        current = {}
    try:
        return validate_backup_settings(current)
    except ValueError:
        return default_backup_settings()


def save_backup_settings(payload: Dict[str, Any], actor: str) -> Dict[str, Any]:
    previous = get_backup_settings()
    settings = validate_backup_settings(payload, previous)
    settings["updated_by"] = actor
    settings["updated_at_utc"] = utc_now_iso()
    write_json_atomic(state_path("backup_settings.json"), settings)
    audit_write(
        actor=actor,
        action="BACKUP_SETTINGS_UPDATED",
        params={
            "previous": {
                "enabled": previous["enabled"],
                "time_local": previous["time_local"],
                "timezone": previous["timezone"],
                "retention_days": previous["retention_days"],
            },
            "new": {
                "enabled": settings["enabled"],
                "time_local": settings["time_local"],
                "timezone": settings["timezone"],
                "retention_days": settings["retention_days"],
            },
        },
        result="SUCCESS",
    )
    return settings


def scheduler_status() -> Dict[str, Any]:
    data = read_json(state_path("backup_scheduler_status.json"), {})
    return data if isinstance(data, dict) else {}


def save_scheduler_status(data: Dict[str, Any]) -> None:
    write_json_atomic(state_path("backup_scheduler_status.json"), data)


def next_scheduled_run(settings: Dict[str, Any], now_utc: Optional[datetime] = None) -> Optional[str]:
    if not settings.get("enabled", False):
        return None
    timezone_name = str(settings.get("timezone") or "Europe/London")
    zone = ZoneInfo(timezone_name)
    current = (now_utc or utc_now()).astimezone(zone)
    hour, minute = (int(part) for part in str(settings["time_local"]).split(":"))
    candidate = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= current:
        candidate += timedelta(days=1)
    return candidate.isoformat()
