import React, { useEffect, useMemo, useState } from "react";
import type { LotBalance, Material } from "../../types";
import { apiFetch } from "../../utils/api";
import { formatDate } from "../../utils/format";

type IssueModalProps = {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  lotBalances: LotBalance[];
  onIssuePosted: () => void;
};

const IssueModal: React.FC<IssueModalProps> = ({
  open,
  onClose,
  materials,
  lotBalances,
  onIssuePosted,
}) => {
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null
  );
  const [selectedLotNumber, setSelectedLotNumber] = useState("");
  const [qty, setQty] = useState("");
  const [productBatchNo, setProductBatchNo] = useState("");
  const [productManufactureDate, setProductManufactureDate] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMaterialSearch("");
      setSelectedMaterial(null);
      setSelectedLotNumber("");
      setQty("");
      setProductBatchNo("");
      setProductManufactureDate("");
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
    setSelectedLotNumber("");
  };

  const availableLots = useMemo(() => {
    if (!selectedMaterial) return [];
    return lotBalances.filter(
      (lot) =>
        lot.material_code === selectedMaterial.material_code &&
        lot.balance_qty > 0
    );
  }, [lotBalances, selectedMaterial]);

  const selectedLot = useMemo(
    () =>
      availableLots.find((l) => l.lot_number === selectedLotNumber) || null,
    [availableLots, selectedLotNumber]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedMaterial) {
      setSubmitError("Please select a material.");
      return;
    }
    if (!selectedLot) {
      setSubmitError("Please select a lot to issue from.");
      return;
    }
    if (!qty) {
      setSubmitError("Please enter a quantity to issue.");
      return;
    }

    const numericQty = Number(qty);
    if (!numericQty || numericQty <= 0) {
      setSubmitError("Quantity must be a positive number.");
      return;
    }
    if (numericQty > selectedLot.balance_qty) {
      setSubmitError(
        `You cannot issue more than the available balance (${selectedLot.balance_qty} ${selectedLot.uom_code}).`
      );
      return;
    }

    if (!productBatchNo.trim()) {
      setSubmitError("Please enter the ES product batch number.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        material_code: selectedMaterial.material_code,
        lot_number: selectedLot.lot_number,
        qty: numericQty,
        uom_code: selectedLot.uom_code || selectedMaterial.base_uom_code,
        product_batch_no: productBatchNo.trim(),
        product_manufacture_date: productManufactureDate
          ? new Date(productManufactureDate).toISOString()
          : null,
        created_by: "apingu",
        comment: comment || null,
      };

      await apiFetch("/issues/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onIssuePosted();
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message ?? "Failed to post issue");
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
            <div className="modal-title">Issues &amp; Consumption</div>
            <div className="modal-subtitle">
              Draw stock from a specific lot and capture ES batch usage.
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>
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
                  placeholder="Search by name or code..."
                  value={materialSearch}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setSelectedMaterial(null);
                    setSelectedLotNumber("");
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

            <div className="form-group">
              <label className="label">Issue from lot</label>
              <select
                className="input"
                value={selectedLotNumber}
                onChange={(e) => setSelectedLotNumber(e.target.value)}
                disabled={!selectedMaterial || availableLots.length === 0}
              >
                <option value="">
                  {selectedMaterial
                    ? availableLots.length > 0
                      ? "Select a lot…"
                      : "No lots with available balance"
                    : "Select a material first"}
                </option>
                {availableLots.map((lot) => (
                  <option key={lot.lot_number} value={lot.lot_number}>
                    {lot.lot_number} • {formatDate(lot.expiry_date)} •{" "}
                    {lot.balance_qty} {lot.uom_code}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="label">
                Quantity to issue{" "}
                {selectedLot
                  ? `(${selectedLot.uom_code})`
                  : selectedMaterial
                  ? `(${selectedMaterial.base_uom_code})`
                  : ""}
              </label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 150"
              />
              {selectedLot && (
                <div className="alert-meta" style={{ marginTop: 4 }}>
                  Available:{" "}
                  <strong>
                    {selectedLot.balance_qty} {selectedLot.uom_code}
                  </strong>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="label">ES product batch no.</label>
              <input
                className="input"
                placeholder="e.g. ES000123"
                value={productBatchNo}
                onChange={(e) => setProductBatchNo(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Product manufacture date</label>
              <input
                className="input"
                type="date"
                value={productManufactureDate}
                onChange={(e) => setProductManufactureDate(e.target.value)}
              />
            </div>

            <div className="form-group form-group-full">
              <label className="label">Comment</label>
              <textarea
                className="input textarea"
                placeholder="e.g. Weighed into ES000123 during dispensing."
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
              {submitting ? "Posting…" : "Post issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IssueModal;
