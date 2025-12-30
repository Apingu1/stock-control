BEGIN;

-- Generic trigger function to block UPDATE/DELETE (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_audit_update_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit trail is append-only. % on % is not permitted.', TG_OP, TG_TABLE_NAME;
END;
$$;

-- Apply to all audit tables
DO $$
BEGIN
  -- lot_status_changes
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_lot_status_changes'
  ) THEN
    CREATE TRIGGER trg_no_ud_lot_status_changes
    BEFORE UPDATE OR DELETE ON lot_status_changes
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;

  -- stock_transaction_edits
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_stock_transaction_edits'
  ) THEN
    CREATE TRIGGER trg_no_ud_stock_transaction_edits
    BEFORE UPDATE OR DELETE ON stock_transaction_edits
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;

  -- material_edits
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_material_edits'
  ) THEN
    CREATE TRIGGER trg_no_ud_material_edits
    BEFORE UPDATE OR DELETE ON material_edits
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;

  -- approved_manufacturer_edits
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_approved_manufacturer_edits'
  ) THEN
    CREATE TRIGGER trg_no_ud_approved_manufacturer_edits
    BEFORE UPDATE OR DELETE ON approved_manufacturer_edits
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;

  -- security_audit_events
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_ud_security_audit_events'
  ) THEN
    CREATE TRIGGER trg_no_ud_security_audit_events
    BEFORE UPDATE OR DELETE ON security_audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_update_delete();
  END IF;
END $$;

COMMIT;
