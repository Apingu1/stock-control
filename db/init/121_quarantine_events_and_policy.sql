-- db/init/121_quarantine_events_and_policy.sql

-- Phase Q1: Quarantine events ledger + policy setting (singleton)
-- Purpose:
--   - Record every quarantine-related STATUS_CHANGE (including splits/merges)
--   - Record DESTRUCTION issues (consumption_type=DESTRUCTION)
--   - Store a future enforcement toggle for issuing from quarantined lots

CREATE TABLE IF NOT EXISTS quarantine_policy_settings (
  id                         INT PRIMARY KEY,
  allow_issue_from_quarantine BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                 VARCHAR(100)
);

-- singleton seed
INSERT INTO quarantine_policy_settings (id, allow_issue_from_quarantine)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS quarantine_events (
  id                  BIGSERIAL PRIMARY KEY,
  event_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type           VARCHAR(30) NOT NULL, -- STATUS_CHANGE | DESTRUCTION

  material_lot_id      INT NOT NULL REFERENCES material_lots(id),
  dest_material_lot_id INT NULL REFERENCES material_lots(id),

  qty                  NUMERIC(18,6) NOT NULL,
  uom_code             VARCHAR(30),

  from_status          VARCHAR(20),
  to_status            VARCHAR(20),

  reason               VARCHAR(500),
  created_by           VARCHAR(100),

  source               VARCHAR(20) NOT NULL DEFAULT 'RECORDED'
);

CREATE INDEX IF NOT EXISTS idx_quarantine_events_event_at ON quarantine_events(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_quarantine_events_material_lot ON quarantine_events(material_lot_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_events_dest_lot ON quarantine_events(dest_material_lot_id);
