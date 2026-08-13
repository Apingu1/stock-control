"""Single-instance daily backup scheduler used by the production compose stack."""

from __future__ import annotations

import signal
import time
from datetime import datetime, timezone
from typing import Any, Dict
from zoneinfo import ZoneInfo

from .db_tool_state import (
    audit_write,
    get_backup_settings,
    next_scheduled_run,
    save_scheduler_status,
    scheduler_status,
    utc_now_iso,
)
from .services.backup_service import BackupBusyError, create_backup


POLL_SECONDS = 30
_running = True


def _stop(_signum: int, _frame: object) -> None:
    global _running
    _running = False


def _status_with_schedule(settings: Dict[str, Any], status: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **status,
        "enabled": settings["enabled"],
        "time_local": settings["time_local"],
        "timezone": settings["timezone"],
        "retention_days": settings["retention_days"],
        "next_run_at_local": next_scheduled_run(settings),
    }


def run_due_backup() -> bool:
    settings = get_backup_settings()
    status = scheduler_status()
    zone = ZoneInfo(settings["timezone"])
    now_local = datetime.now(timezone.utc).astimezone(zone)
    today = now_local.date().isoformat()
    hour, minute = (int(part) for part in settings["time_local"].split(":"))
    due = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)

    if not settings["enabled"] or now_local < due or status.get("last_attempt_date_local") == today:
        refreshed = _status_with_schedule(settings, status)
        refreshed["last_heartbeat_utc"] = utc_now_iso()
        save_scheduler_status(refreshed)
        return False

    status = _status_with_schedule(settings, status)
    status.update(
        {
            "last_attempt_date_local": today,
            "last_attempt_at_utc": utc_now_iso(),
            "last_result": "RUNNING",
            "last_error": None,
        }
    )
    save_scheduler_status(status)

    try:
        manifest = create_backup(
            actor="SYSTEM_SCHEDULER",
            backup_type="AUTO",
            reason=f"Scheduled daily backup at {settings['time_local']} {settings['timezone']}",
        )
        status.update(
            {
                "last_result": "SUCCESS",
                "last_success_at_utc": manifest.get("completed_at_utc"),
                "last_filename": manifest.get("filename"),
                "last_error": None,
            }
        )
    except BackupBusyError as exc:
        # A manual operation happened at the scheduled instant. Clear today's
        # attempt marker so the scheduler retries after that operation finishes.
        status.pop("last_attempt_date_local", None)
        status.update({"last_result": "DEFERRED", "last_error": str(exc)})
    except Exception as exc:
        status.update({"last_result": "FAILED", "last_error": str(exc)[:4000]})
        audit_write(
            actor="SYSTEM_SCHEDULER",
            action="SCHEDULED_BACKUP",
            params={"scheduled_time": settings["time_local"], "timezone": settings["timezone"]},
            result="FAILED",
            error=str(exc)[:4000],
        )
    finally:
        status["last_heartbeat_utc"] = utc_now_iso()
        status["next_run_at_local"] = next_scheduled_run(settings)
        save_scheduler_status(status)
    return status.get("last_result") == "SUCCESS"


def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    initial = scheduler_status()
    initial.update({"process_started_at_utc": utc_now_iso(), "last_heartbeat_utc": utc_now_iso()})
    save_scheduler_status(_status_with_schedule(get_backup_settings(), initial))
    while _running:
        try:
            run_due_backup()
        except Exception as exc:
            status = scheduler_status()
            status.update({"last_result": "SCHEDULER_ERROR", "last_error": str(exc)[:4000], "last_heartbeat_utc": utc_now_iso()})
            save_scheduler_status(status)
        for _ in range(POLL_SECONDS):
            if not _running:
                break
            time.sleep(1)


if __name__ == "__main__":
    main()
