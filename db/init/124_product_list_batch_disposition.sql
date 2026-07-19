-- db/init/124_product_list_batch_disposition.sql
--
-- Product master data, mandatory product/material controls, auditable batch
-- disposition and a zero-stock Cancelled BMR pathway.

BEGIN;

-- ---------------------------------------------------------------------------
-- The existing "Cancelled BMR" Materials Library row is retained as the
-- recognisable UI marker, but is explicitly classified as non-stock.  It must
-- never need a goods receipt, lot balance, quantity or value.
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS materials
  ADD COLUMN IF NOT EXISTS is_cancelled_bmr_marker BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE materials
SET is_cancelled_bmr_marker = TRUE
WHERE LOWER(BTRIM(material_code)) = LOWER('Cancelled BMR')
  AND LOWER(BTRIM(name)) = LOWER('Cancelled BMR');

CREATE UNIQUE INDEX IF NOT EXISTS uq_materials_single_cancelled_bmr_marker
  ON materials ((is_cancelled_bmr_marker))
  WHERE is_cancelled_bmr_marker = TRUE;

-- ---------------------------------------------------------------------------
-- Product List master data and current mandatory material membership.
-- Product/material removals are soft-inactivated so the operational state is
-- current while the append-only audit table preserves every prior state.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS products (
  id                       BIGSERIAL PRIMARY KEY,
  product_code             VARCHAR(50) NOT NULL,
  product_name             VARCHAR(255) NOT NULL,
  reference                VARCHAR(255) NOT NULL,
  version_number           VARCHAR(100) NOT NULL,
  shelf_life_days          INTEGER NOT NULL,
  licence_status           VARCHAR(20) NOT NULL,
  line_type                VARCHAR(20) NOT NULL,
  storage_condition        VARCHAR(20) NOT NULL,
  controlled_drug_status   VARCHAR(20) NOT NULL,
  export_status            VARCHAR(20) NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               VARCHAR(100) NOT NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by               VARCHAR(100) NOT NULL,

  CONSTRAINT uq_products_product_code UNIQUE (product_code),
  CONSTRAINT ck_products_code_upper CHECK (product_code = UPPER(product_code)),
  CONSTRAINT ck_products_shelf_life_positive CHECK (shelf_life_days > 0),
  CONSTRAINT ck_products_licence CHECK (licence_status IN ('LICENSED', 'UNLICENSED')),
  CONSTRAINT ck_products_line_type CHECK (line_type IN ('STOCK_LINE', 'BESPOKE')),
  CONSTRAINT ck_products_storage CHECK (storage_condition IN ('FRIDGELINE', 'AMBIENT')),
  CONSTRAINT ck_products_cd CHECK (controlled_drug_status IN ('CONTROLLED_DRUG', 'N_A')),
  CONSTRAINT ck_products_export CHECK (export_status IN ('EXPORT_LINE', 'N_A')),
  CONSTRAINT ck_products_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_product_code_ci
  ON products (UPPER(product_code));
CREATE INDEX IF NOT EXISTS idx_products_status_code
  ON products (status, product_code);

CREATE TABLE IF NOT EXISTS product_materials (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  material_id   INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    VARCHAR(100) NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    VARCHAR(100) NOT NULL,
  CONSTRAINT uq_product_materials_product_material UNIQUE (product_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_product_materials_active_product
  ON product_materials (product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_product_materials_active_material
  ON product_materials (material_id, is_active);

CREATE TABLE IF NOT EXISTS product_audit_events (
  id             BIGSERIAL PRIMARY KEY,
  event_type     VARCHAR(50) NOT NULL,
  event_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_id     BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_code   VARCHAR(50) NOT NULL,
  product_name   VARCHAR(255) NOT NULL,
  actor_username VARCHAR(100) NOT NULL,
  reason         VARCHAR(500) NOT NULL,
  before_json    JSONB,
  after_json     JSONB
);

CREATE INDEX IF NOT EXISTS idx_product_audit_events_product_at
  ON product_audit_events (product_id, event_at DESC);

-- ---------------------------------------------------------------------------
-- One authoritative header per new multi-material consumption.  Existing
-- stock_transactions remain the stock/cost ledger; the header records master
-- data snapshots and lets a Cancelled BMR exist with zero stock movements.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consumption_batches (
  id                         BIGSERIAL PRIMARY KEY,
  consumption_group_id       VARCHAR(36) NOT NULL UNIQUE,
  consumption_type           VARCHAR(30) NOT NULL,
  product_id                 BIGINT REFERENCES products(id) ON DELETE RESTRICT,
  product_code_snapshot      VARCHAR(50),
  product_name_snapshot      VARCHAR(255),
  product_reference_snapshot VARCHAR(255),
  product_version_snapshot   VARCHAR(100),
  product_batch_no           VARCHAR(50),
  product_manufacture_date   DATE,
  total_batch_size           NUMERIC(18,6),
  batch_size_uom             VARCHAR(50),
  number_of_units            INTEGER,
  target_ref                 VARCHAR(255),
  disposition                VARCHAR(20) NOT NULL DEFAULT 'COMPLIANT',
  disposition_reason         VARCHAR(500),
  compliance_triggers        JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_material_codes     JSONB NOT NULL DEFAULT '[]'::jsonb,
  unexpected_material_codes  JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_by                VARCHAR(100),
  approved_at                TIMESTAMPTZ,
  comment                    VARCHAR(500),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                 VARCHAR(100) NOT NULL,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                 VARCHAR(100) NOT NULL,

  CONSTRAINT ck_consumption_batches_type CHECK (
    consumption_type IN ('USAGE', 'WASTAGE', 'DESTRUCTION', 'R_AND_D', 'CANCELLED_BMR')
  ),
  CONSTRAINT ck_consumption_batches_disposition CHECK (
    disposition IN ('COMPLIANT', 'REJECTED', 'CANCELLED')
  ),
  CONSTRAINT ck_consumption_batches_total_size CHECK (
    total_batch_size IS NULL OR total_batch_size > 0
  ),
  CONSTRAINT ck_consumption_batches_units CHECK (
    number_of_units IS NULL OR number_of_units > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_consumption_batches_product_batch
  ON consumption_batches (product_batch_no);
CREATE INDEX IF NOT EXISTS idx_consumption_batches_product_code
  ON consumption_batches (product_code_snapshot);
CREATE INDEX IF NOT EXISTS idx_consumption_batches_disposition_created
  ON consumption_batches (disposition, created_at DESC);

-- Backfill headers for previously grouped submissions without changing any
-- historical stock transaction.  Product master fields remain snapshots only
-- until an authorised user creates the corresponding Product List item.
INSERT INTO consumption_batches (
  consumption_group_id,
  consumption_type,
  product_code_snapshot,
  product_batch_no,
  product_manufacture_date,
  total_batch_size,
  batch_size_uom,
  number_of_units,
  target_ref,
  disposition,
  comment,
  created_at,
  created_by,
  updated_at,
  updated_by
)
SELECT
  st.consumption_group_id,
  MAX(COALESCE(st.consumption_type, 'USAGE')),
  MAX(st.es_product_code),
  MAX(st.product_batch_no),
  MAX(st.product_manufacture_date),
  MAX(st.total_batch_size),
  MAX(st.batch_size_uom),
  MAX(st.number_of_units),
  MAX(st.target_ref),
  'COMPLIANT',
  MAX(st.comment),
  MIN(st.created_at),
  COALESCE(MIN(st.created_by), 'legacy'),
  MAX(st.created_at),
  COALESCE(MIN(st.created_by), 'legacy')
FROM stock_transactions st
WHERE st.txn_type = 'ISSUE'
  AND st.consumption_group_id IS NOT NULL
GROUP BY st.consumption_group_id
ON CONFLICT (consumption_group_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS batch_audit_events (
  id                   BIGSERIAL PRIMARY KEY,
  event_type           VARCHAR(50) NOT NULL,
  event_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumption_group_id VARCHAR(36) NOT NULL REFERENCES consumption_batches(consumption_group_id) ON DELETE RESTRICT,
  product_code         VARCHAR(50),
  product_batch_no     VARCHAR(50),
  actor_username       VARCHAR(100) NOT NULL,
  reason               VARCHAR(500) NOT NULL,
  before_json          JSONB,
  after_json           JSONB
);

CREATE INDEX IF NOT EXISTS idx_batch_audit_events_group_at
  ON batch_audit_events (consumption_group_id, event_at DESC);

CREATE TABLE IF NOT EXISTS role_permission_audit_events (
  id             BIGSERIAL PRIMARY KEY,
  event_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role_name      TEXT NOT NULL REFERENCES roles(name) ON DELETE RESTRICT,
  actor_username VARCHAR(100) NOT NULL,
  reason         VARCHAR(500) NOT NULL,
  before_json    JSONB NOT NULL,
  after_json     JSONB NOT NULL
);

-- Append-only protection uses the existing generic trigger function created by
-- migration 099.  The guards below remain idempotent for rebuilt datasets.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_product_audit_events') THEN
    CREATE TRIGGER trg_no_ud_product_audit_events
    BEFORE UPDATE OR DELETE ON product_audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_batch_audit_events') THEN
    CREATE TRIGGER trg_no_ud_batch_audit_events
    BEFORE UPDATE OR DELETE ON batch_audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_role_permission_audit_events') THEN
    CREATE TRIGGER trg_no_ud_role_permission_audit_events
    BEFORE UPDATE OR DELETE ON role_permission_audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Permission registry.  Custom roles receive explicit FALSE rows; defaults are
-- then granted to the three system roles as agreed.
-- ---------------------------------------------------------------------------

INSERT INTO permissions (key, description)
VALUES
  ('products.view', 'Product List: view and search products'),
  ('products.create', 'Product List: create products'),
  ('products.edit', 'Product List: edit product details and mandatory materials'),
  ('products.status_change', 'Product List: activate or inactivate products'),
  ('issues.approve_rejected_batch', 'Approve posting an inactive or material-nonconforming batch as rejected'),
  ('issues.record_cancelled_bmr', 'Record a zero-stock Cancelled BMR against an allocated batch number')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_key, granted)
SELECT r.name, p.key, FALSE
FROM roles r
CROSS JOIN permissions p
WHERE p.key IN (
  'products.view',
  'products.create',
  'products.edit',
  'products.status_change',
  'issues.approve_rejected_batch',
  'issues.record_cancelled_bmr'
)
ON CONFLICT (role_name, permission_key) DO NOTHING;

UPDATE role_permissions
SET granted = TRUE
WHERE role_name IN ('ADMIN', 'SENIOR')
  AND permission_key IN (
    'products.view',
    'products.create',
    'products.edit',
    'products.status_change',
    'issues.approve_rejected_batch',
    'issues.record_cancelled_bmr'
  );

UPDATE role_permissions
SET granted = TRUE
WHERE role_name = 'OPERATOR'
  AND permission_key IN ('products.view', 'issues.record_cancelled_bmr');

-- ---------------------------------------------------------------------------
-- Rebuild the unified audit read model with Product List, batch-disposition and
-- role-permission events.  Existing audit sources and exports remain intact.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS audit_events_view;

CREATE VIEW audit_events_view AS
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

SELECT
  'LOT_STATUS_CHANGE'::text,
  lsc.changed_at,
  COALESCE(lsc.changed_by, 'unknown'),
  NULL::text,
  'LOT'::text,
  (m.material_code || ' — ' || m.name || ' — Lot ' || ml.lot_number),
  lsc.reason,
  jsonb_build_object('old_status', lsc.old_status),
  jsonb_build_object('new_status', lsc.new_status)
FROM lot_status_changes lsc
JOIN material_lots ml ON ml.id = lsc.material_lot_id
JOIN materials m ON m.id = ml.material_id

UNION ALL

SELECT
  'STOCK_TRANSACTION_EDIT'::text,
  ste.edited_at,
  COALESCE(ste.edited_by, 'unknown'),
  NULL::text,
  'STOCK_TRANSACTION'::text,
  (m.material_code || ' — ' || m.name || ' — Lot ' || ml.lot_number || ' — ' || st.txn_type),
  ste.edit_reason,
  ste.before_json::jsonb,
  ste.after_json::jsonb
FROM stock_transaction_edits ste
JOIN stock_transactions st ON st.id = ste.stock_transaction_id
JOIN material_lots ml ON ml.id = st.material_lot_id
JOIN materials m ON m.id = ml.material_id

UNION ALL

SELECT
  'MATERIAL_EDIT'::text,
  me.edited_at,
  COALESCE(me.edited_by, 'unknown'),
  NULL::text,
  'MATERIAL'::text,
  (m.material_code || ' — ' || m.name),
  me.edit_reason,
  me.before_json::jsonb,
  me.after_json::jsonb
FROM material_edits me
JOIN materials m ON m.id = me.material_id

UNION ALL

SELECT
  'APPROVED_MANUFACTURER_EDIT'::text,
  ame.edited_at,
  COALESCE(ame.edited_by, 'unknown'),
  NULL::text,
  'MATERIAL'::text,
  (COALESCE(m.material_code, ame.material_code) || ' — ' ||
   COALESCE(m.name, '[unknown material]') || ' — ' ||
   UPPER(COALESCE(ame.action, 'CHANGE')) || ' — ' ||
   COALESCE(ame.manufacturer_name, '')),
  ame.edit_reason,
  ame.before_json::jsonb,
  ame.after_json::jsonb
FROM approved_manufacturer_edits ame
LEFT JOIN materials m ON m.material_code = ame.material_code

UNION ALL

SELECT
  pae.event_type::text,
  pae.event_at,
  pae.actor_username,
  NULL::text,
  'PRODUCT'::text,
  (pae.product_code || ' — ' || pae.product_name),
  pae.reason,
  pae.before_json,
  pae.after_json
FROM product_audit_events pae

UNION ALL

SELECT
  bae.event_type::text,
  bae.event_at,
  bae.actor_username,
  NULL::text,
  'BATCH'::text,
  (COALESCE(bae.product_code, '[no product]') || ' — ' || COALESCE(bae.product_batch_no, bae.consumption_group_id)),
  bae.reason,
  bae.before_json,
  bae.after_json
FROM batch_audit_events bae

UNION ALL

SELECT
  'ROLE_PERMISSIONS_UPDATED'::text,
  rpae.event_at,
  rpae.actor_username,
  NULL::text,
  'ROLE_PERMISSIONS'::text,
  rpae.role_name,
  rpae.reason,
  rpae.before_json,
  rpae.after_json
FROM role_permission_audit_events rpae;

-- ---------------------------------------------------------------------------
-- Batch analytics now includes zero-stock cancellations and structured
-- disposition while retaining legacy transaction-only batches.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS analytics_product_batch_frequency CASCADE;
DROP VIEW IF EXISTS analytics_product_batches_cost CASCADE;

CREATE VIEW analytics_product_batches_cost AS
WITH issue_groups AS (
  SELECT
    st.consumption_group_id,
    st.es_product_code,
    st.product_batch_no,
    COALESCE(SUM(st.total_value), 0)::numeric(18,6) AS batch_total_cost,
    COUNT(*)::int AS issue_txn_count,
    MIN(st.created_at) AS first_issue_at,
    MAX(st.created_at) AS last_issue_at,
    MAX(st.total_batch_size) AS total_batch_size,
    MAX(st.batch_size_uom) AS batch_size_uom,
    MAX(st.number_of_units) AS number_of_units
  FROM stock_transactions st
  WHERE st.txn_type = 'ISSUE'
    AND st.es_product_code IS NOT NULL
    AND st.product_batch_no IS NOT NULL
  GROUP BY st.consumption_group_id, st.es_product_code, st.product_batch_no
),
header_rows AS (
  SELECT
    cb.product_code_snapshot AS es_product_code,
    cb.product_name_snapshot AS product_name,
    cb.product_reference_snapshot AS product_reference,
    cb.product_version_snapshot AS product_version,
    cb.product_batch_no,
    COALESCE(ig.batch_total_cost, 0)::numeric(18,6) AS batch_total_cost,
    COALESCE(ig.issue_txn_count, 0)::int AS issue_txn_count,
    COALESCE(ig.first_issue_at, cb.created_at) AS first_issue_at,
    COALESCE(ig.last_issue_at, cb.created_at) AS last_issue_at,
    COALESCE(ig.total_batch_size, cb.total_batch_size) AS total_batch_size,
    COALESCE(ig.batch_size_uom, cb.batch_size_uom) AS batch_size_uom,
    COALESCE(ig.number_of_units, cb.number_of_units) AS number_of_units,
    cb.disposition AS batch_disposition,
    cb.disposition_reason,
    cb.compliance_triggers,
    cb.missing_material_codes,
    cb.unexpected_material_codes,
    cb.created_by,
    cb.approved_by,
    cb.consumption_group_id
  FROM consumption_batches cb
  LEFT JOIN issue_groups ig ON ig.consumption_group_id = cb.consumption_group_id
  WHERE cb.product_code_snapshot IS NOT NULL
    AND cb.product_batch_no IS NOT NULL
),
legacy_rows AS (
  SELECT
    ig.es_product_code,
    NULL::varchar(255) AS product_name,
    NULL::varchar(255) AS product_reference,
    NULL::varchar(100) AS product_version,
    ig.product_batch_no,
    ig.batch_total_cost,
    ig.issue_txn_count,
    ig.first_issue_at,
    ig.last_issue_at,
    ig.total_batch_size,
    ig.batch_size_uom,
    ig.number_of_units,
    'COMPLIANT'::varchar(20) AS batch_disposition,
    NULL::varchar(500) AS disposition_reason,
    '[]'::jsonb AS compliance_triggers,
    '[]'::jsonb AS missing_material_codes,
    '[]'::jsonb AS unexpected_material_codes,
    NULL::varchar(100) AS created_by,
    NULL::varchar(100) AS approved_by,
    ig.consumption_group_id
  FROM issue_groups ig
  WHERE ig.consumption_group_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM consumption_batches cb
       WHERE cb.consumption_group_id = ig.consumption_group_id
     )
)
SELECT * FROM header_rows
UNION ALL
SELECT * FROM legacy_rows;

CREATE VIEW analytics_product_batch_frequency AS
SELECT
  apbc.es_product_code,
  COUNT(DISTINCT apbc.product_batch_no)::int AS unique_batch_count,
  MAX(apbc.last_issue_at) AS last_issue_at,
  COUNT(DISTINCT apbc.product_batch_no) FILTER (WHERE apbc.batch_disposition = 'COMPLIANT')::int AS compliant_batch_count,
  COUNT(DISTINCT apbc.product_batch_no) FILTER (WHERE apbc.batch_disposition = 'REJECTED')::int AS rejected_batch_count,
  COUNT(DISTINCT apbc.product_batch_no) FILTER (WHERE apbc.batch_disposition = 'CANCELLED')::int AS cancelled_batch_count
FROM analytics_product_batches_cost apbc
GROUP BY apbc.es_product_code;

DROP VIEW IF EXISTS analytics_monthly_kpis;
CREATE VIEW analytics_monthly_kpis AS
WITH transaction_months AS (
  SELECT
    date_trunc('month', st.created_at AT TIME ZONE 'Europe/London')::date AS month_bucket,
    COALESCE(SUM(CASE WHEN st.txn_type = 'RECEIPT' THEN st.total_value ELSE 0 END), 0)::numeric(18,6) AS receipt_total_value,
    COALESCE(SUM(CASE WHEN st.txn_type = 'ISSUE' THEN st.total_value ELSE 0 END), 0)::numeric(18,6) AS issue_total_value,
    COUNT(*) FILTER (WHERE st.txn_type = 'RECEIPT')::int AS receipt_txn_count,
    COUNT(*) FILTER (WHERE st.txn_type = 'ISSUE')::int AS issue_txn_count
  FROM stock_transactions st
  GROUP BY 1
),
batch_months AS (
  SELECT
    date_trunc('month', a.last_issue_at AT TIME ZONE 'Europe/London')::date AS month_bucket,
    COUNT(*) FILTER (WHERE a.batch_disposition = 'COMPLIANT')::int AS unique_batches_issued,
    COUNT(*) FILTER (WHERE a.batch_disposition = 'REJECTED')::int AS rejected_batches,
    COUNT(*) FILTER (WHERE a.batch_disposition = 'CANCELLED')::int AS cancelled_batches
  FROM analytics_product_batches_cost a
  GROUP BY 1
)
SELECT
  COALESCE(t.month_bucket, b.month_bucket) AS month_bucket,
  COALESCE(t.receipt_total_value, 0)::numeric(18,6) AS receipt_total_value,
  COALESCE(t.issue_total_value, 0)::numeric(18,6) AS issue_total_value,
  COALESCE(t.receipt_txn_count, 0)::int AS receipt_txn_count,
  COALESCE(t.issue_txn_count, 0)::int AS issue_txn_count,
  COALESCE(b.unique_batches_issued, 0)::int AS unique_batches_issued,
  COALESCE(b.rejected_batches, 0)::int AS rejected_batches,
  COALESCE(b.cancelled_batches, 0)::int AS cancelled_batches
FROM transaction_months t
FULL OUTER JOIN batch_months b ON b.month_bucket = t.month_bucket
ORDER BY month_bucket;

COMMIT;
