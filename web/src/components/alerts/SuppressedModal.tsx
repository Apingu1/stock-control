// web/src/components/alerts/SuppressedModal.tsx
import React from "react";
import type { AlertAction, ParsedKey } from "./alertsTypes";
import { tableStyle, tdStyle, thStyle } from "./alertsUi";

export type SuppressedRow = { key: string; info: ParsedKey; action: AlertAction };

type Props = {
  open: boolean;
  suppressed: SuppressedRow[];
  onClose: () => void;
  onUndo: (k: string, info: ParsedKey) => void;
  onDelete: (k: string) => void;
};

const SuppressedModal: React.FC<Props> = ({ open, suppressed, onClose, onUndo, onDelete }) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Suppressed alerts</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              Alerts marked as “Not required” won’t appear until manually undone.
            </div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ padding: 14 }}>
          {suppressed.length === 0 ? (
            <div className="muted">No suppressed alerts.</div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Material</th>
                  <th style={thStyle}>Lot</th>
                  <th style={thStyle}>State</th>
                  <th style={thStyle}>ETA</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppressed.map((s) => (
                  <tr key={s.key}>
                    <td style={tdStyle}>{s.info.type === "LOW_STOCK" ? "Low Stock" : "Low Expiry"}</td>
                    <td style={tdStyle}>{s.info.material}</td>
                    <td style={tdStyle}>{s.info.lot ?? "—"}</td>
                    <td style={tdStyle}>{s.action.state}</td>
                    <td style={tdStyle}>{s.action.eta_text ?? "—"}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button className="btn btn-ghost" type="button" onClick={() => onUndo(s.key, s.info)}>
                        Undo
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => onDelete(s.key)}
                        style={{ marginLeft: 8 }}
                      >
                        Delete entry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuppressedModal;
