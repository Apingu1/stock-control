// src/components/receipts/NewReceiptModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { Material, ApprovedManufacturer, Receipt } from "../../types";
import { apiFetch } from "../../utils/api";

type NewReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  onReceiptPosted: () => void;

  mode?: "create" | "edit";
  initial?: Receipt;
};

const NewReceiptModal: React.FC<NewReceiptModalProps> = ({
  open,
  onClose,
  materials,
  onReceiptPosted,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit" && !!initial;

  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [qty, setQty] = useState("");

  // ✅ D1: Total cost input (line total), unit price is derived
  const [totalCost, setTotalCost] = useState("");

  const [supplier, setSupplier] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [compliesEs, setCompliesEs] = useState(false);

  // ✅ Edit-only audit reason
  const [editReason, setEditReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setSubmitting(false);
    setSubmitError(null);

    if (isEdit && initial) {
      setMaterialSearch(`${initial.material_name} (${initial.material_code})`);
      const mat = materials.find((m) => m.material_code === initial.material_code) || null;
      setSelectedMaterial(mat);

      setLotNumber(initial.lot_number || "");
      setExpiryDate(initial.expiry_date ? String(initial.expiry_date).slice(0, 10) : "");
      setReceiptDate(initial.created_at ? String(initial.created_at).slice(0, 10) : "");
      setQty(String(initial.qty ?? ""));

      // ✅ load existing stored total_value if present
      setTotalCost(initial.total_value != null ? String(initial.total_value) : "");

      setSupplier(initial.supplier || "");
      setManufacturer(initial.manufacturer || "");
      setCompliesEs(initial.complies_es_criteria === true);
      setEditReason("");
      return;
    }

    // Create reset
    setMaterialSearch("");
    setSelectedMaterial(null);
    setLotNumber("");
    setExpiryDate("");
    setReceiptDate("");
    setQty("");
    setTotalCost("");
    setSupplier("");
    setManufacturer("");
    setCompliesEs(false);
    setEditReason("");
  }, [open, isEdit, initial, materials]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials.slice(0, 15);
    return materials
      .filter(
        (m) =>
          m.material_code.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [materialSearch, materials]);

  const handleSelectMaterial = (m: Material) => {
    setSelectedMaterial(m);
    setMaterialSearch(`${m.name} (${m.material_code})`);
    setManufacturer("");
  };

  const isTabletsCaps = selectedMaterial?.category_code === "TABLETS_CAPSULES";

  const approvedForMaterial: ApprovedManufacturer[] = useMemo(() => {
    if (!selectedMaterial?.approved_manufacturers) return [];
    return selectedMaterial.approved_manufacturers.filter((am) => am.is_active);
  }, [selectedMaterial]);

  const hasApproved = approvedForMaterial.length > 0;

  const calculatedUnitCost = useMemo(() => {
    const q = Number(qty);
    const t = Number(totalCost);
    if (!Number.isFinite(q) || q <= 0) return null;
    if (!Number.isFinite(t) || t <= 0) return null;
    const unit = t / q;
    // show to 4 dp (same convention as backend)
    return Math.round((unit + Number.EPSILON) * 10000) / 10000;
  }, [qty, totalCost]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMaterial && !isEdit) {
      setSubmitError("Please select a material.");
      return;
    }
    if (!qty) {
      setSubmitError("Please enter a quantity.");
      return;
    }
    if (!receiptDate && !isEdit) {
      setSubmitError("Please enter a receipt date.");
      return;
    }

    // ✅ Require total cost for create (invoice reality)
    if (!totalCost || Number(totalCost) <= 0) {
      setSubmitError("Please enter the total cost (£) for this receipt line.");
      return;
    }

    // ✅ TABLETS_CAPSULES always controlled: block if no approved manufacturers configured
    if (isTabletsCaps && !hasApproved) {
      setSubmitError(
        "No approved manufacturers are configured for this TABLETS/CAPSULES material. Add one in Materials before booking in."
      );
      return;
    }
    if (isTabletsCaps && !manufacturer) {
      setSubmitError("Please select an approved manufacturer.");
      return;
    }

    if (!compliesEs && !isEdit) {
      setSubmitError("Ensure goods in comply with ES criteria specified in ES.SOP.112");
      return;
    }

    if (isEdit && !editReason.trim()) {
      setSubmitError("Edit reason is required for audit trail.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!isEdit) {
        const payload = {
          material_code: selectedMaterial!.material_code,
          lot_number: lotNumber || null,
          expiry_date: expiryDate || null,
          receipt_date: receiptDate,
          qty: Number(qty),
          uom_code: selectedMaterial!.base_uom_code,

          // ✅ D1: send total_value; backend derives unit_price
          total_value: totalCost ? Number(totalCost) : null,
          unit_price: null,

          supplier: supplier || null,
          manufacturer: manufacturer || null,
          complies_es_criteria: compliesEs,
        };

        await apiFetch("/receipts/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const payload = {
          qty: Number(qty),

          // ✅ D1 edit: allow editing total line cost; backend derives unit_price
          total_value: totalCost ? Number(totalCost) : null,
          unit_price: null,

          supplier: supplier || null,
          manufacturer: manufacturer || null,
          edit_reason: editReason.trim(),
        };

        await apiFetch(`/receipts/${initial!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      onReceiptPosted();
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message ?? "Failed to save receipt.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Edit goods receipt" : "New goods receipt"}</div>
            <div className="modal-subtitle">
              {isEdit ? "Edits are audit-trailed. Provide a reason for change." : "Post an incoming delivery into ES stock."}
            </div>
          </div>

          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="label">Material</label>
              <div className="typeahead-wrap">
                <input
                  className="input"
                  placeholder="Start typing material or code…"
                  value={materialSearch}
                  disabled={isEdit}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setSelectedMaterial(null);
                    setManufacturer("");
                  }}
                />
                {filteredMaterials.length > 0 && !selectedMaterial && !isEdit && (
                  <div className="typeahead-dropdown">
                    {filteredMaterials.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="typeahead-option"
                        onClick={() => handleSelectMaterial(m)}
                      >
                        <div className="typeahead-main">{m.name}</div>
                        <div className="typeahead-meta">
                          {m.material_code} • {m.manufacturer || m.supplier || "No supplier set"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="label">Lot number</label>
              <input
                className="input"
                placeholder="e.g. A43621"
                value={lotNumber}
                disabled={isEdit}
                onChange={(e) => setLotNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Expiry date</label>
              <input
                className="input"
                type="date"
                value={expiryDate}
                disabled={isEdit}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">
                Quantity {selectedMaterial ? `(${selectedMaterial.base_uom_code})` : ""}
              </label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.001"
                placeholder="e.g. 120"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">{isEdit ? "Goods receipt date (locked)" : "Receipt date"}</label>
              <input
                className="input"
                type="date"
                value={receiptDate}
                disabled={isEdit}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Total cost (£)</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g. 1250.00"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
              />
              {calculatedUnitCost != null && (
                <div className="info-row" style={{ marginTop: 6 }}>
                  Calculated unit cost: <strong>£{calculatedUnitCost.toFixed(4)}</strong>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="label">Supplier (optional)</label>
              <input
                className="input"
                placeholder="e.g. Supplier Ltd"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">
                Manufacturer {isTabletsCaps ? "(approved only)" : "(optional)"}
              </label>

              {/* ✅ TABLETS_CAPSULES always dropdown */}
              {isTabletsCaps ? (
                <>
                  <select
                    className="input"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    disabled={!hasApproved}
                  >
                    <option value="">Select…</option>
                    {approvedForMaterial.map((am) => (
                      <option key={am.id} value={am.manufacturer_name}>
                        {am.manufacturer_name}
                      </option>
                    ))}
                  </select>

                  {!hasApproved && (
                    <div className="info-row" style={{ marginTop: 6 }}>
                      No approved manufacturers configured. Add one in Materials before booking in.
                    </div>
                  )}
                </>
              ) : (
                <input
                  className="input"
                  placeholder="e.g. Manufacturer Ltd"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                />
              )}
            </div>

            {!isEdit && (
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="label">Compliance check</label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={compliesEs} onChange={(e) => setCompliesEs(e.target.checked)} />
                  <span>Goods in comply with ES criteria specified in ES.SOP.112</span>
                </label>
              </div>
            )}

            {isEdit && (
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="label">
                  Edit reason <span style={{ color: "#fca5a5" }}>(required)</span>
                </label>
                <textarea
                  className="input textarea"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Explain what changed and why (audit trail)…"
                />
              </div>
            )}
          </div>

          {submitError && <div className="error-row">{submitError}</div>}

          <div className="modal-footer">
            <button type="button" className="btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Post receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewReceiptModal;
