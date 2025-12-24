// src/components/receipts/NewReceiptModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import type { Material, ApprovedManufacturer } from "../../types";
import { apiFetch } from "../../utils/api";

type NewReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  onReceiptPosted: () => void;
};

const NewReceiptModal: React.FC<NewReceiptModalProps> = ({
  open,
  onClose,
  materials,
  onReceiptPosted,
}) => {
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [compliesEs, setCompliesEs] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMaterialSearch("");
      setSelectedMaterial(null);
      setLotNumber("");
      setExpiryDate("");
      setReceiptDate("");
      setQty("");
      setUnitPrice("");
      setSupplier("");
      setManufacturer("");
      setCompliesEs(false);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

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

  const hasApproved = isTabletsCaps && approvedForMaterial.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMaterial) {
      setSubmitError("Please select a material.");
      return;
    }
    if (!qty) {
      setSubmitError("Please enter a quantity.");
      return;
    }
    if (!receiptDate) {
      setSubmitError("Please enter a receipt date.");
      return;
    }
    if (hasApproved && !manufacturer) {
      setSubmitError("Please select an approved manufacturer.");
      return;
    }
    if (!compliesEs) {
      setSubmitError(
        "Ensure goods in comply with ES criteria specified in ES.SOP.112"
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        material_code: selectedMaterial.material_code,
        lot_number: lotNumber || null,
        expiry_date: expiryDate || null,
        receipt_date: receiptDate,
        qty: Number(qty),
        uom_code: selectedMaterial.base_uom_code,
        unit_price: unitPrice ? Number(unitPrice) : null,
        supplier: supplier || null,
        manufacturer: manufacturer || null,
        complies_es_criteria: compliesEs,
        // created_by is set server-side from JWT user
      };

      await apiFetch("/receipts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onReceiptPosted();
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message ?? "Failed to post receipt.");
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
            <div className="modal-title">New goods receipt</div>
            <div className="modal-subtitle">
              Post an incoming delivery into ES stock.
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
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setSelectedMaterial(null);
                    setManufacturer("");
                  }}
                />
                {filteredMaterials.length > 0 && !selectedMaterial && (
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
                          {m.material_code} •{" "}
                          {m.manufacturer || m.supplier || "No supplier set"}
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
                onChange={(e) => setLotNumber(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Expiry date</label>
              <input
                className="input"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">
                Quantity{" "}
                {selectedMaterial ? `(${selectedMaterial.base_uom_code})` : ""}
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
              <label className="label">Receipt date</label>
              <input
                className="input"
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Unit price (optional)</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g. 12.50"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
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
                Manufacturer {hasApproved ? "(approved only)" : "(optional)"}
              </label>

              {hasApproved ? (
                <select
                  className="input"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                >
                  <option value="">Select…</option>
                  {approvedForMaterial.map((am) => (
                    <option key={am.id} value={am.name}>
                      {am.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  placeholder="e.g. Manufacturer Ltd"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                />
              )}
            </div>

            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="label">Compliance check</label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={compliesEs}
                  onChange={(e) => setCompliesEs(e.target.checked)}
                />
                <span>
                  Goods in comply with ES criteria specified in ES.SOP.112
                </span>
              </label>
            </div>
          </div>

          {submitError && <div className="error-row">{submitError}</div>}

          <div className="modal-footer">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" disabled={submitting}>
              {submitting ? "Posting…" : "Post receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewReceiptModal;
