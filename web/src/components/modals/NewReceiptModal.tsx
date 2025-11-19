// src/components/modals/NewReceiptModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import type { Material } from "../../types";
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
  const [receiptDate, setReceiptDate] = useState(""); // NEW
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [comment, setComment] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMaterialSearch("");
      setSelectedMaterial(null);
      setLotNumber("");
      setExpiryDate("");
      setReceiptDate(""); // reset
      setQty("");
      setUnitPrice("");
      setSupplier("");
      setManufacturer("");
      setComment("");
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial) {
      setSubmitError("Please select a material from the list.");
      return;
    }
    if (!qty) {
      setSubmitError("Please enter a quantity.");
      return;
    }
    if (!receiptDate) {
      setSubmitError("Please enter the receipt date.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        material_code: selectedMaterial.material_code,
        lot_number: lotNumber || null,
        expiry_date: expiryDate || null,
        receipt_date: receiptDate || null, // NEW
        qty: Number(qty),
        uom_code: selectedMaterial.base_uom_code,
        unit_price: unitPrice ? Number(unitPrice) : null,
        supplier: supplier || null,
        manufacturer: manufacturer || null,
        comment: comment || null,
        created_by: "apingu", // placeholder until auth wired
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
      setSubmitError(err.message ?? "Failed to post receipt");
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
            <div className="modal-title">New Goods Receipt</div>
            <div className="modal-subtitle">
              Post a new receipt into the stock ledger.
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>
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
                  placeholder="e.g. RAMIPRIL 10MG (MAT0327)"
                  value={materialSearch}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setSelectedMaterial(null);
                  }}
                />
                {filteredMaterials.length > 0 && (
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

            {/* LOT */}
            <div className="form-group">
              <label className="label">Lot number</label>
              <input
                className="input"
                placeholder="e.g. 4P3611A"
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
                placeholder="e.g. 280"
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
                placeholder="e.g. 0.025"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>

            {/* SUPPLIER / MANUFACTURER */}
            <div className="form-group">
              <label className="label">Supplier</label>
              <input
                className="input"
                placeholder="e.g. MEDI HEALTH"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Manufacturer</label>
              <input
                className="input"
                placeholder="e.g. Zentiva"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>

            {/* COMMENT */}
            <div className="form-group form-group-full">
              <label className="label">Comment</label>
              <textarea
                className="input textarea"
                placeholder="e.g. Initial booking from delivery note"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
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
