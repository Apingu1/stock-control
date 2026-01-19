import React from "react";
import type { ApprovedManufacturer } from "../../../types";
import { normalize } from "./materialFormUtils";

type Props = {
  isEdit: boolean;
  isTabletsCaps: boolean;

  approvedManufacturers: ApprovedManufacturer[];
  approvedVisible: ApprovedManufacturer[];

  pendingRemoveIds: Set<number>;
  pendingAddNames: string[];
  pendingAddsNormalized: Set<string>;

  newApprovedName: string;
  setNewApprovedName: (v: string) => void;

  loadingApproved: boolean;
  approvedError: string | null;
  setApprovedError: (v: string | null) => void;

  stageDelete: (id: number) => void;
  undoDelete: (id: number) => void;
  removePendingAdd: (name: string) => void;

  setPendingRemoveIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  setPendingAddNames: React.Dispatch<React.SetStateAction<string[]>>;
};

const ApprovedManufacturersSection: React.FC<Props> = (p) => {
  if (!p.isEdit || !p.isTabletsCaps) return null;

  const handleAddApproved = () => {
    const nm = p.newApprovedName.trim();
    if (!nm) {
      p.setApprovedError("Manufacturer name is required.");
      return;
    }

    const n = normalize(nm);

    // already in DB list:
    const existing = p.approvedManufacturers.find(
      (a) => normalize(a.manufacturer_name) === n
    );
    if (existing) {
      // undo pending removal
      if (p.pendingRemoveIds.has(existing.id)) {
        p.setPendingRemoveIds((prev) => {
          const next = new Set(prev);
          next.delete(existing.id);
          return next;
        });
        p.setNewApprovedName("");
        p.setApprovedError(null);
        return;
      }

      p.setApprovedError("That manufacturer is already on the approved list.");
      return;
    }

    if (p.pendingAddsNormalized.has(n)) {
      p.setApprovedError("That manufacturer is already pending add.");
      return;
    }

    p.setPendingAddNames((prev) => [...prev, nm]);
    p.setNewApprovedName("");
    p.setApprovedError(null);
  };

  return (
    <div className="form-group form-group-full">
      <label className="label">Approved manufacturers (TABLETS/CAPSULES)</label>
      <p className="content-subtitle" style={{ marginBottom: 8 }}>
        Operators will only be able to book goods in against these manufacturers in the
        Goods Receipt screen.
      </p>

      {p.loadingApproved && <div className="info-row">Loading manufacturers…</div>}
      {p.approvedError && <div className="error-row">{p.approvedError}</div>}

      {!p.loadingApproved &&
        p.approvedVisible.length === 0 &&
        p.pendingAddNames.length === 0 && (
          <div className="info-row">No approved manufacturers configured yet.</div>
        )}

      {p.approvedVisible.length > 0 && (
        <ul className="pill-list">
          {p.approvedVisible.map((am) => {
            const pendingRemove = p.pendingRemoveIds.has(am.id);
            return (
              <li
                key={am.id}
                className="pill"
                style={{ opacity: pendingRemove ? 0.5 : 1 }}
                title={pendingRemove ? "Pending removal (will apply on Save)" : undefined}
              >
                <span>{am.manufacturer_name}</span>
                {!pendingRemove ? (
                  <button
                    type="button"
                    className="pill-remove-btn"
                    onClick={() => p.stageDelete(am.id)}
                    title="Mark for removal (will apply on Save)"
                  >
                    ✕
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pill-remove-btn"
                    onClick={() => p.undoDelete(am.id)}
                    title="Undo removal"
                  >
                    Undo
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {p.pendingAddNames.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="info-row" style={{ marginBottom: 6 }}>
            Pending add (applies on Save):
          </div>
          <ul className="pill-list">
            {p.pendingAddNames.map((n) => (
              <li key={normalize(n)} className="pill" title="Pending add (will apply on Save)">
                <span>{n}</span>
                <button
                  type="button"
                  className="pill-remove-btn"
                  onClick={() => p.removePendingAdd(n)}
                  title="Remove from pending adds"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          className="input"
          placeholder="Add manufacturer name…"
          value={p.newApprovedName}
          onChange={(e) => p.setNewApprovedName(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={handleAddApproved}>
          Add
        </button>
      </div>
    </div>
  );
};

export default ApprovedManufacturersSection;
