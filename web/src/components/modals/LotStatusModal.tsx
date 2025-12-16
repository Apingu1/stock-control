import { useEffect, useMemo, useState } from "react";
import type { LotBalance } from "../../types";
import { apiFetch } from "../../utils/api";

type LotStatusModalProps = {
  open: boolean;
  lot: LotBalance | null;
  onClose: () => void;
  onStatusChanged: () => void;
};

const STATUS_OPTIONS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "QUARANTINE", label: "Quarantine" },
  { value: "REJECTED", label: "Rejected" },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

const normalizeStatus = (s: string | null | undefined) => {
  const up = (s || "").toUpperCase().trim();
  if (up === "RELEASED") return "AVAILABLE";
  return up || "UNKNOWN";
};

const statusPillClass = (s: string) => {
  if (s === "AVAILABLE") return "tag tag-success";
  if (s === "QUARANTINE") return "tag tag-warning";
  return "tag tag-muted";
};

const LotStatusModal: React.FC<LotStatusModalProps> = ({
  open,
  lot,
  onClose,
  onStatusChanged,
}) => {
  const [newStatus, setNewStatus] = useState<StatusValue | "">("");
  const [reason, setReason] = useState("");
  const [isPartial, setIsPartial] = useState(false); // default unchecked
  const [partialQty, setPartialQty] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentStatus = useMemo(() => normalizeStatus(lot?.status), [lot?.status]);

  useEffect(() => {
    if (open) {
      setNewStatus("");
      setReason("");
      setIsPartial(false);
      setPartialQty("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, lot]);

  const affectedQty = useMemo(() => {
    if (!lot) return "";
    if (!isPartial) return `${lot.balance_qty} ${lot.uom_code}`;
    const n = Number(partialQty);
    if (!Number.isFinite(n) || n <= 0) return `— ${lot.uom_code}`;
    return `${n} ${lot.uom_code}`;
  }, [lot, isPartial, partialQty]);

  if (!open || !lot) return null;

  const validate = () => {
    if (!newStatus) return "Please select a new status.";
    if (!reason.trim()) return "Reason for change is required.";
    if (newStatus === currentStatus) return "New status must be different to current status.";

    if (!isPartial) return null;

    const n = Number(partialQty);
    if (!Number.isFinite(n) || n <= 0) return "Enter a valid partial quantity to move.";
    if (n > Number(lot.balance_qty)) return "Partial quantity cannot exceed current balance.";

    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await apiFetch(`/lot-balances/${lot.material_lot_id}/status-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_status: newStatus,
          reason: reason.trim(),
          changed_by: "web-ui",
          whole_lot: !isPartial,
          move_qty: isPartial ? Number(partialQty) : null,
        }),
      });

      onStatusChanged();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to change status");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Change lot status</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {lot.material_name}
              </div>

              <div style={{ fontSize: 13, color: "#9ca3af" }}>
                • Lot <span style={{ fontWeight: 600, color: "#e5e7eb" }}>{lot.lot_number}</span>
              </div>

              <span className={statusPillClass(currentStatus)} style={{ marginLeft: 2 }}>
                {currentStatus}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={submitting}
            style={{ padding: "6px 10px" }}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group">
              <span className="label">Change to</span>
              <select
                className="input"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as StatusValue | "")}
              >
                <option value="">Select status…</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <span className="label">Affected quantity</span>
              <div style={{ fontSize: 13, marginTop: 8 }}>{affectedQty}</div>
            </div>

            <div className="form-group form-group-full">
              <span className="label">Move type</span>

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={isPartial}
                  onChange={(e) => {
                    setIsPartial(e.target.checked);
                    setPartialQty("");
                    setError(null);
                  }}
                  disabled={submitting}
                />
                <span style={{ fontSize: 13 }}>Change status for partial quantity</span>
              </label>

              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
                If enabled, the system splits the lot into two lines in Live Lots (same lot number,
                different status).
              </div>
            </div>

            {isPartial && (
              <div className="form-group form-group-full">
                <span className="label">Partial quantity to move</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={partialQty}
                  onChange={(e) => setPartialQty(e.target.value)}
                  placeholder={`Max ${lot.balance_qty} ${lot.uom_code}`}
                  disabled={submitting}
                />
              </div>
            )}

            <div className="form-group form-group-full">
              <span className="label">Reason (mandatory)</span>
              <textarea
                className="input textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="E.g. damaged, investigation, QA disposition…"
                disabled={submitting}
              />
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Confirm change"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LotStatusModal;
