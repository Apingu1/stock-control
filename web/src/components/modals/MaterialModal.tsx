import React, { useEffect, useMemo, useState } from "react";
import type { Material, ApprovedManufacturer } from "../../types";
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_TYPE_OPTIONS,
  MATERIAL_UOM_OPTIONS,
} from "../../constants";
import { apiFetch } from "../../utils/api";

type MaterialFormProps = {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Material>;
  mode: "create" | "edit";
  onSaved: () => void;
};

const MaterialModal: React.FC<MaterialFormProps> = ({
  open,
  onClose,
  initial,
  mode,
  onSaved,
}) => {
  const [materialCode, setMaterialCode] = useState(initial?.material_code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryCode, setCategoryCode] = useState(
    initial?.category_code ?? MATERIAL_CATEGORY_OPTIONS[0]
  );
  const [typeCode, setTypeCode] = useState(
    initial?.type_code ?? MATERIAL_TYPE_OPTIONS[0]
  );
  const [baseUomCode, setBaseUomCode] = useState(
    initial?.base_uom_code ?? MATERIAL_UOM_OPTIONS[0]
  );
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? "");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");

  // ✅ edit-only audit reason
  const [editReason, setEditReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Approved manufacturers (TABLETS/CAPS)
  const [approvedManufacturers, setApprovedManufacturers] = useState<
    ApprovedManufacturer[]
  >([]);
  const [newApprovedName, setNewApprovedName] = useState("");
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [approvedError, setApprovedError] = useState<string | null>(null);

  // ✅ stage changes to approved manufacturers until Save
  const [pendingRemoveIds, setPendingRemoveIds] = useState<Set<number>>(
    new Set()
  );
  const [pendingAddNames, setPendingAddNames] = useState<string[]>([]);

  const isEdit = mode === "edit";
  const isTabletsCaps = categoryCode === "TABLETS_CAPSULES";

  const loadApproved = async (code: string) => {
    try {
      setApprovedError(null);
      setLoadingApproved(true);
      const res = await apiFetch(
        `/materials/${encodeURIComponent(code)}/approved-manufacturers`
      );
      const data = (await res.json()) as ApprovedManufacturer[];
      setApprovedManufacturers(data);
    } catch (err: any) {
      console.error(err);
      setApprovedError(err.message ?? "Failed to load approved manufacturers");
      setApprovedManufacturers([]);
    } finally {
      setLoadingApproved(false);
    }
  };

  useEffect(() => {
    if (open) {
      setMaterialCode(initial?.material_code ?? "");
      setName(initial?.name ?? "");
      setCategoryCode(initial?.category_code ?? MATERIAL_CATEGORY_OPTIONS[0]);
      setTypeCode(initial?.type_code ?? MATERIAL_TYPE_OPTIONS[0]);
      setBaseUomCode(initial?.base_uom_code ?? MATERIAL_UOM_OPTIONS[0]);
      setManufacturer(initial?.manufacturer ?? "");
      setSupplier(initial?.supplier ?? "");
      setStatus(initial?.status ?? "ACTIVE");
      setSubmitting(false);
      setError(null);

      setEditReason("");

      setNewApprovedName("");
      setApprovedError(null);

      // reset staged manufacturer changes on open
      setPendingRemoveIds(new Set());
      setPendingAddNames([]);

      if (mode === "edit" && initial?.material_code) {
        void loadApproved(initial.material_code);
      } else {
        setApprovedManufacturers([]);
      }
    }
  }, [open, initial, mode]);

  // Helpers for staged changes
  const normalize = (s: string) => s.trim().toUpperCase();

  const approvedVisible = useMemo(() => {
    // show DB-approved list but visually mark pending removals
    return approvedManufacturers.slice().sort((a, b) =>
      a.manufacturer_name.localeCompare(b.manufacturer_name)
    );
  }, [approvedManufacturers]);

  const pendingAddsNormalized = useMemo(() => {
    return new Set(pendingAddNames.map(normalize));
  }, [pendingAddNames]);

  // ✅ IMPORTANT: this must be BELOW hooks (useMemo/useEffect) to avoid hook order crash
  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setApprovedError(null);

    if (!materialCode.trim() && mode === "create") {
      setError("Material code is required.");
      return;
    }
    if (!name.trim()) {
      setError("Material name is required.");
      return;
    }
    if (!categoryCode.trim() || !typeCode.trim() || !baseUomCode.trim()) {
      setError("Category, type and base UOM are required.");
      return;
    }

    // Require reason for edits
    if (isEdit && !editReason.trim()) {
      setError("Edit reason is required for audit trail.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const payload = {
          material_code: materialCode.trim(),
          name: name.trim(),
          category_code: categoryCode.trim(),
          type_code: typeCode.trim(),
          base_uom_code: baseUomCode.trim(),
          manufacturer: manufacturer || null,
          supplier: supplier || null,
          // Silent default – we no longer expose this in the UI
          complies_es_criteria: true,
          status,
          created_by: "apingu",
        };

        await apiFetch("/materials/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (mode === "edit" && initial?.material_code) {
        // 1) Save material (audit-trailed)
        const payload = {
          name: name.trim(),
          category_code: categoryCode.trim(),
          type_code: typeCode.trim(),
          base_uom_code: baseUomCode.trim(),
          manufacturer: manufacturer || null,
          supplier: supplier || null,
          complies_es_criteria: true,
          status,
          edit_reason: editReason.trim(),
        };

        await apiFetch(`/materials/${encodeURIComponent(initial.material_code)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        // 2) Apply staged approved-manufacturer removals
        const removeIds = Array.from(pendingRemoveIds);
        for (const id of removeIds) {
          await apiFetch(
            `/materials/${encodeURIComponent(
              initial.material_code
            )}/approved-manufacturers/${id}`,
            { method: "DELETE" }
          );
        }

        // 3) Apply staged approved-manufacturer adds
        for (const manuName of pendingAddNames) {
          const body = {
            manufacturer_name: manuName.trim(),
            is_active: true,
            created_by: "apingu",
          };
          await apiFetch(
            `/materials/${encodeURIComponent(initial.material_code)}/approved-manufacturers`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          );
        }

        // 4) Refresh list and reset staged changes
        await loadApproved(initial.material_code);
        setPendingRemoveIds(new Set());
        setPendingAddNames([]);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to save material");
    } finally {
      setSubmitting(false);
    }
  };

  // Stage add (no API call)
  const handleAddApproved = () => {
    if (!isEdit || !initial?.material_code) return;

    const name = newApprovedName.trim();
    if (!name) {
      setApprovedError("Manufacturer name is required.");
      return;
    }

    const n = normalize(name);

    // If it's already in DB list and pending removal, treat as "undo removal"
    const existing = approvedManufacturers.find(
      (a) => normalize(a.manufacturer_name) === n
    );
    if (existing) {
      if (pendingRemoveIds.has(existing.id)) {
        setPendingRemoveIds((prev) => {
          const next = new Set(prev);
          next.delete(existing.id);
          return next;
        });
        setNewApprovedName("");
        setApprovedError(null);
        return;
      }
      setApprovedError("That manufacturer is already on the approved list.");
      return;
    }

    // Prevent duplicate pending adds
    if (pendingAddsNormalized.has(n)) {
      setApprovedError("That manufacturer is already pending add.");
      return;
    }

    setPendingAddNames((prev) => [...prev, name]);
    setNewApprovedName("");
    setApprovedError(null);
  };

  // Stage delete (no API call)
  const handleDeleteApproved = (id: number) => {
    if (!isEdit || !initial?.material_code) return;
    setApprovedError(null);

    setPendingRemoveIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const undoDeleteApproved = (id: number) => {
    setPendingRemoveIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const removePendingAdd = (nameToRemove: string) => {
    const n = normalize(nameToRemove);
    setPendingAddNames((prev) => prev.filter((x) => normalize(x) !== n));
  };

  const handleCancel = () => {
    // Discard staged approved-manufacturer changes
    setPendingRemoveIds(new Set());
    setPendingAddNames([]);
    setApprovedError(null);
    setError(null);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isEdit ? "Edit material" : "New material"}
            </div>
            <div className="modal-subtitle">
              {isEdit
                ? "Update master data for this ES material."
                : "Register a new material into the ES master list."}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="label">Material code</label>
              <input
                className="input"
                placeholder="e.g. MAT0327"
                value={materialCode}
                onChange={(e) => setMaterialCode(e.target.value)}
                disabled={isEdit}
              />
            </div>

            <div className="form-group">
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. RAMIPRIL 10MG TABLETS"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEdit}
              />
            </div>

            <div className="form-group">
              <label className="label">Category</label>
              <select
                className="input"
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value)}
              >
                {MATERIAL_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">Type</label>
              <select
                className="input"
                value={typeCode}
                onChange={(e) => setTypeCode(e.target.value)}
              >
                {MATERIAL_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">Base UOM</label>
              <select
                className="input"
                value={baseUomCode}
                onChange={(e) => setBaseUomCode(e.target.value)}
              >
                {MATERIAL_UOM_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">Status</label>
              <select
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="OBSOLETE">OBSOLETE</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </div>

            <div className="form-group">
              <label className="label">Default manufacturer</label>
              <input
                className="input"
                placeholder="e.g. Zentiva"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Default supplier</label>
              <input
                className="input"
                placeholder="e.g. MEDI HEALTH"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>

            {isEdit && (
              <div className="form-group form-group-full">
                <label className="label">
                  Edit reason{" "}
                  <span style={{ color: "#fca5a5" }}>(required)</span>
                </label>
                <textarea
                  className="input textarea"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Explain what changed and why (audit trail)…"
                />
              </div>
            )}

            {isEdit && isTabletsCaps && (
              <div className="form-group form-group-full">
                <label className="label">
                  Approved manufacturers (TABLETS/CAPSULES)
                </label>
                <p className="content-subtitle" style={{ marginBottom: 8 }}>
                  Operators will only be able to book goods in against these
                  manufacturers in the Goods Receipt screen.
                </p>

                {loadingApproved && (
                  <div className="info-row">Loading manufacturers…</div>
                )}
                {approvedError && <div className="error-row">{approvedError}</div>}

                {!loadingApproved &&
                  approvedVisible.length === 0 &&
                  pendingAddNames.length === 0 && (
                    <div className="info-row">
                      No approved manufacturers configured yet.
                    </div>
                  )}

                {approvedVisible.length > 0 && (
                  <ul className="pill-list">
                    {approvedVisible.map((am) => {
                      const pendingRemove = pendingRemoveIds.has(am.id);
                      return (
                        <li
                          key={am.id}
                          className="pill"
                          style={{ opacity: pendingRemove ? 0.5 : 1 }}
                          title={
                            pendingRemove
                              ? "Pending removal (will apply on Save)"
                              : undefined
                          }
                        >
                          <span>{am.manufacturer_name}</span>
                          {!pendingRemove ? (
                            <button
                              type="button"
                              className="pill-remove-btn"
                              onClick={() => handleDeleteApproved(am.id)}
                              title="Mark for removal (will apply on Save)"
                            >
                              ✕
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pill-remove-btn"
                              onClick={() => undoDeleteApproved(am.id)}
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

                {pendingAddNames.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="info-row" style={{ marginBottom: 6 }}>
                      Pending add (applies on Save):
                    </div>
                    <ul className="pill-list">
                      {pendingAddNames.map((n) => (
                        <li
                          key={normalize(n)}
                          className="pill"
                          title="Pending add (will apply on Save)"
                        >
                          <span>{n}</span>
                          <button
                            type="button"
                            className="pill-remove-btn"
                            onClick={() => removePendingAdd(n)}
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
                    value={newApprovedName}
                    onChange={(e) => setNewApprovedName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddApproved}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {!isEdit && isTabletsCaps && (
              <div className="form-group form-group-full">
                <label className="label">Approved manufacturers</label>
                <p className="content-subtitle">
                  Save the material first, then edit it to configure the list of
                  approved manufacturers for TABLETS/CAPSULES.
                </p>
              </div>
            )}
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialModal;
