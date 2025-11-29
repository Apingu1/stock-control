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
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null
  );

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

  // Reset when modal opens
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

  const isTabletsCaps =
    selectedMaterial?.category_code === "TABLETS_CAPSULES";

  const approvedForMaterial: ApprovedManufacturer[] = useMemo(() => {
    if (!selectedMaterial?.approved_manufacturers) return [];
    return selectedMaterial.approved_manufacturers.filter(
      (am) => am.is_active
    );
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
    setSubmitError("Ensure goods in comply with ES criteria specified in ES.SOP.112");
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
        // 🔑 this was missing and caused the 422
        uom_code: selectedMaterial.base_uom_code,
        unit_price: unitPrice ? Number(unitPrice) : null,
        supplier: supplier || null,
        manufacturer: manufacturer || null,
        complies_es_criteria: compliesEs,
        created_by: "apingu",
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
      setSubmitError(err.message ?? "Failed to post receipt.");
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
            {/* MATERIAL */}
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

            {/* LOT NUMBER */}
            <div className="form-group">
              <label className="label">Lot number</label>
              <input
                className="input"
                placeholder="e.g. A43621"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
              />
            </div>

            {/* EXPIRY / QTY */}
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

            {/* RECEIPT DATE / UNIT PRICE */}
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
              <label className="label">Unit price (£)</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.0001"
                placeholder="e.g. 0.10"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>

            {/* SUPPLIER / MANUFACTURER */}
            <div className="form-group">
              <label className="label">Supplier</label>
              <input
                className="input"
                placeholder="e.g. Medi Health"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Manufacturer</label>

              {isTabletsCaps ? (
                hasApproved ? (
                  <select
                    className="input"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                  >
                    <option value="">Select manufacturer…</option>
                    {approvedForMaterial.map((am) => (
                      <option key={am.id} value={am.manufacturer_name}>
                        {am.manufacturer_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select className="input" disabled>
                    <option>
                      No approved manufacturers set. Configure in Materials
                      Library.
                    </option>
                  </select>
                )
              ) : (
                <input
                  className="input"
                  placeholder="e.g. Zentiva"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                />
              )}
            </div>

            {/* ES CRITERIA */}
            <div className="form-group form-group-full">
              <label className="label">ES criteria</label>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <input
                  id="receipt-es-checkbox"
                  type="checkbox"
                  checked={compliesEs}
                  onChange={(e) => setCompliesEs(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <label
                  htmlFor="receipt-es-checkbox"
                  style={{ cursor: "pointer" }}
                >
                  Goods-in checks confirm this lot complies with ES criteria
                </label>
              </div>
            </div>
          </div>

          {submitError && <div className="form-error">{submitError}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? "Posting…" : "Post receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewReceiptModal;
