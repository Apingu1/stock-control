# api/app/audit_logger.py
from __future__ import annotations

from typing import Any, Optional, Dict

from sqlalchemy import text, bindparam
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session


def log_security_event(
    db: Session,
    *,
    event_type: str,
    actor_username: Optional[str] = None,
    actor_role: Optional[str] = None,
    target_type: Optional[str] = None,
    target_ref: Optional[str] = None,
    reason: Optional[str] = None,
    success: Optional[bool] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Writes to security_audit_events (append-only).
    Use for: logins, admin/security actions, and optional CREATE events.
    """
    stmt = (
        text(
            """
            INSERT INTO security_audit_events
              (event_type, actor_username, actor_role, target_type, target_ref, reason,
               success, ip_address, user_agent, meta_json)
            VALUES
              (:event_type, :actor_username, :actor_role, :target_type, :target_ref, :reason,
               :success, :ip_address, :user_agent, :meta_json)
            """
        )
        # Ensure meta_json is sent as proper JSONB (and allow None)
        .bindparams(bindparam("meta_json", type_=JSONB))
    )

    db.execute(
        stmt,
        {
            "event_type": event_type,
            "actor_username": actor_username,
            "actor_role": actor_role,
            "target_type": target_type,
            "target_ref": target_ref,
            "reason": reason,
            "success": success,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "meta_json": None if meta is None else meta,
        },
    )


def log_approved_manufacturer_edit(
    db: Session,
    *,
    edited_by: Optional[str],
    material_code: str,
    action: str,  # ADD / REMOVE
    manufacturer_name: str,
    edit_reason: str,
    before_json: Optional[dict] = None,
    after_json: Optional[dict] = None,
) -> None:
    """
    Writes to approved_manufacturer_edits (append-only).
    """
    stmt = (
        text(
            """
            INSERT INTO approved_manufacturer_edits
              (edited_by, material_code, action, manufacturer_name, edit_reason, before_json, after_json)
            VALUES
              (:edited_by, :material_code, :action, :manufacturer_name, :edit_reason,
               :before_json, :after_json)
            """
        )
        .bindparams(bindparam("before_json", type_=JSONB))
        .bindparams(bindparam("after_json", type_=JSONB))
    )

    db.execute(
        stmt,
        {
            "edited_by": edited_by,
            "material_code": material_code,
            "action": action,
            "manufacturer_name": manufacturer_name,
            "edit_reason": edit_reason,
            "before_json": before_json,
            "after_json": after_json,
        },
    )
