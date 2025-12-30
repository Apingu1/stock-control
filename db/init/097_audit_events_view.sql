BEGIN;

CREATE OR REPLACE VIEW audit_events_view AS

  -- Lot status changes (human-readable target + before/after status)
  SELECT
    'LOT_STATUS_CHANGE'::text AS event_type,
    lsc.changed_at AS event_at,
    lsc.changed_by AS actor_username,
    'LOT'::text AS target_type,
    (m.material_code || ' — ' || m.name || ' — Lot ' || ml.lot_number)::text AS target_ref,
    lsc.reason AS reason,
    jsonb_build_object('status', lsc.old_status) AS before_json,
    jsonb_build_object('status', lsc.new_status) AS after_json
  FROM lot_status_changes lsc
  JOIN material_lots ml ON ml.id = lsc.material_lot_id
  JOIN materials m ON m.id = ml.material_id

  UNION ALL

  -- Stock transaction edits (human-readable target; no txn_id shown)
  SELECT
    'STOCK_TRANSACTION_EDIT'::text AS event_type,
    ste.edited_at AS event_at,
    ste.edited_by AS actor_username,
    'STOCK_TRANSACTION'::text AS target_type,
    (m.material_code || ' — ' || m.name || ' — Lot ' || ml.lot_number || ' — ' || st.txn_type)::text AS target_ref,
    ste.edit_reason AS reason,
    ste.before_json::jsonb AS before_json,
    ste.after_json::jsonb AS after_json
  FROM stock_transaction_edits ste
  JOIN stock_transactions st ON st.id = ste.stock_transaction_id
  JOIN material_lots ml ON ml.id = st.material_lot_id
  JOIN materials m ON m.id = ml.material_id

  UNION ALL

  -- Material edits
  SELECT
    'MATERIAL_EDIT'::text AS event_type,
    me.edited_at AS event_at,
    me.edited_by AS actor_username,
    'MATERIAL'::text AS target_type,
    (m.material_code || ' — ' || m.name)::text AS target_ref,
    me.edit_reason AS reason,
    me.before_json::jsonb AS before_json,
    me.after_json::jsonb AS after_json
  FROM material_edits me
  JOIN materials m ON m.id = me.material_id

  UNION ALL

  -- Approved manufacturer changes
  SELECT
    'APPROVED_MANUFACTURER_EDIT'::text AS event_type,
    ame.edited_at AS event_at,
    ame.edited_by AS actor_username,
    'MATERIAL'::text AS target_type,
    (ame.material_code || ' — ' || ame.action || ' — ' || ame.manufacturer_name)::text AS target_ref,
    ame.edit_reason AS reason,
    ame.before_json AS before_json,
    ame.after_json AS after_json
  FROM approved_manufacturer_edits ame

  UNION ALL

  -- Security events (login etc.)
  SELECT
    sea.event_type AS event_type,
    sea.event_at AS event_at,
    sea.actor_username AS actor_username,
    sea.target_type AS target_type,
    sea.target_ref AS target_ref,
    sea.reason AS reason,
    NULL::jsonb AS before_json,
    sea.meta_json AS after_json
  FROM security_audit_events sea
;

COMMIT;
