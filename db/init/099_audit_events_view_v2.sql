BEGIN;

DROP VIEW IF EXISTS audit_events_view;

CREATE VIEW audit_events_view AS
-- -------------------------------------------------------------------
-- SECURITY / AUTH EVENTS (LOGIN_SUCCESS / LOGIN_FAIL etc)
-- -------------------------------------------------------------------
SELECT
  sae.event_type,
  sae.event_at,
  sae.actor_username,
  sae.actor_role,
  sae.target_type,
  sae.target_ref,
  sae.reason,
  NULL::jsonb AS before_json,
  sae.meta_json::jsonb AS after_json
FROM security_audit_events sae

UNION ALL

-- -------------------------------------------------------------------
-- LOT status changes
-- -------------------------------------------------------------------
SELECT
  'LOT_STATUS_CHANGE'::text AS event_type,
  lsc.changed_at AS event_at,
  COALESCE(lsc.changed_by, 'unknown') AS actor_username,
  NULL::text AS actor_role,
  'LOT'::text AS target_type,
  (m.material_code || ' — ' || m.name || ' — Lot ' || ml.lot_number) AS target_ref,
  lsc.reason AS reason,
  jsonb_build_object('old_status', lsc.old_status) AS before_json,
  jsonb_build_object('new_status', lsc.new_status) AS after_json
FROM lot_status_changes lsc
JOIN material_lots ml ON ml.id = lsc.material_lot_id
JOIN materials m ON m.id = ml.material_id

UNION ALL

-- -------------------------------------------------------------------
-- Stock transaction edits (before_json/after_json are TEXT -> cast)
-- -------------------------------------------------------------------
SELECT
  'STOCK_TRANSACTION_EDIT'::text AS event_type,
  ste.edited_at AS event_at,
  COALESCE(ste.edited_by, 'unknown') AS actor_username,
  NULL::text AS actor_role,
  'STOCK_TRANSACTION'::text AS target_type,
  (m.material_code || ' — ' || m.name || ' — Lot ' || ml.lot_number || ' — ' || st.txn_type) AS target_ref,
  ste.edit_reason AS reason,
  ste.before_json::jsonb AS before_json,
  ste.after_json::jsonb  AS after_json
FROM stock_transaction_edits ste
JOIN stock_transactions st ON st.id = ste.stock_transaction_id
JOIN material_lots ml ON ml.id = st.material_lot_id
JOIN materials m ON m.id = ml.material_id

UNION ALL

-- -------------------------------------------------------------------
-- MATERIAL edits (assumes material_edits.material_id exists)
-- (If yours is material_code instead, tell me and I’ll flip it.)
-- -------------------------------------------------------------------
SELECT
  'MATERIAL_EDIT'::text AS event_type,
  me.edited_at AS event_at,
  COALESCE(me.edited_by, 'unknown') AS actor_username,
  NULL::text AS actor_role,
  'MATERIAL'::text AS target_type,
  (m.material_code || ' — ' || m.name) AS target_ref,
  me.edit_reason AS reason,
  me.before_json::jsonb AS before_json,
  me.after_json::jsonb  AS after_json
FROM material_edits me
JOIN materials m ON m.id = me.material_id

UNION ALL

-- -------------------------------------------------------------------
-- Approved manufacturer edits:
-- IMPORTANT: approved_manufacturer_edits uses material_code (NOT material_id)
-- -------------------------------------------------------------------
SELECT
  'APPROVED_MANUFACTURER_EDIT'::text AS event_type,
  ame.edited_at AS event_at,
  COALESCE(ame.edited_by, 'unknown') AS actor_username,
  NULL::text AS actor_role,
  'MATERIAL'::text AS target_type,
  (
    COALESCE(m.material_code, ame.material_code) || ' — ' ||
    COALESCE(m.name, '[unknown material]') || ' — ' ||
    UPPER(COALESCE(ame.action, 'CHANGE')) || ' — ' ||
    COALESCE(ame.manufacturer_name, '')
  ) AS target_ref,
  ame.edit_reason AS reason,
  ame.before_json::jsonb AS before_json,
  ame.after_json::jsonb  AS after_json
FROM approved_manufacturer_edits ame
LEFT JOIN materials m ON m.material_code = ame.material_code
;

COMMIT;
