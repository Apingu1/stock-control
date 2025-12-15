import React, { useEffect, useState } from "react";
import type { LotBalance } from "../../types";
import { apiFetch } from "../../utils/api";

type LotStatusModalProps = {
  open: boolean;
  lot: LotBalance | null;
  onClose: () => void;
  onStatusChanged: () => void; // callback after successful change
};

const STATUS_OPTIONS = [
  { value: "RELEASED", label: "Released" },
  { value: "QUARANTINE", label: "Quarantine" },
  { value: "REJECTED", label: "Rejected" },
];

const LotStatusModal: React.FC<LotStatusModalProps> = ({
  open,
  lot,
  onClose,
  onStatusChanged,
}) => {
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNewStatus("");
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, lot]);

  if (!open || !lot) return null;

  const handleSubmit = async () => {
    if (!newStatus) {
      setError("Please select a new status.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason for change is required.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await apiFetch(
        `/lot-balances/${lot.material_lot_id}/status-change`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_status: newStatus,
            reason: reason.trim(),
            changed_by: "web-ui", // placeholder until users/RBAC
          }),
        }
      );

      if (!res.ok) {
        let detail = "Failed to change status";
        try {
          const data = await res.json();
          if (data?.detail) detail = data.detail;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(detail);
      }

      // We don't need the body; App will reload lot balances
      await res.json().catch(() => undefined);

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
          <div>
            <h3 className="modal-title">Change lot status</h3>
            <div className="modal-subtitle">
              {lot.material_code} • {lot.material_name} • Lot {lot.lot_number}
            </div>
          </div>
        </div>

        <div className="modal-body">
          <div
            className="form-grid"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            <div className="form-group">
              <span className="label">Current status</span>
              <div
                className="tag tag-muted"
                style={{ borderRadius: 999, display: "inline-block" }}
              >
                {lot.status || "—"}
              </div>
            </div>

            <div className="form-group">
              <span className="label">New status</span>
              <select
                className="input"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
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
              <span className="label">Current quantity</span>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {lot.balance_qty} {lot.uom_code}
              </div>
            </div>

            <div className="form-group form-group-full">
              <span className="label">Reason for change</span>
              <textarea
                className="input textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="E.g. moved to quarantine due to temperature excursion, or released after QA approval…"
              />
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : "Change status"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LotStatusModal;
