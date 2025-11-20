import React, { useEffect, useMemo, useState } from "react";
import type { LotBalance, Material } from "../../types";
import { apiFetch } from "../../utils/api";

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
  const [selectedLot, setSelectedLot] = useState<LotBalance | null>(null);

  const [qty, setQty] = useState("");
  const [productBatchNo, setProductBatchNo] = useState("");
  const [productManufactureDate, setProductManufactureDate] = useState("");
  const [comment, setComment] = useState("");
  const [manufacturer, setManufacturer] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMaterialSearch("");
      setSelectedMaterial(null);
      setSelectedLot(null);
      setQty("");
      setProductBatchNo("");
      setProductManufactureDate("");
      setComment("");
      setManufacturer("");
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

  const lotsForMaterial = useMemo(() => {
    if (!selectedMaterial) return [];
    return lotBalances.filter(
      (lot) =>
        lot.material_code === selectedMaterial.material_code &&
        lot.balance_qty > 0
    );
  }, [selectedMaterial, lotBalances]);

  const handleSelectMaterial = (m: Material) => {
    setSelectedMaterial(m);
    setMaterialSearch(`${m.name} (${m.material_code})`);
    setSelectedLot(null);
    setManufacturer(m.manufacturer || "");
  };

  const handleSelectLot = (lotId: string) => {
    const lot = lotsForMaterial.find(
      (l) => `${l.material_code}-${l.lot_number}` === lotId
    );
    setSelectedLot(lot || null);
    // manufacturer stays tied to the selected material
    if (selectedMaterial) {
      setManufacturer(selectedMaterial.manufacturer || "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial) {
      setSubmitError("Please select a material.");
      return;
    }
    if (!selectedLot) {
      setSubmitError("Please select a lot for this material.");
      return;
    }
    if (!qty) {
      setSubmitError("Please enter a quantity.");
      return;
    }
    if (!productBatchNo) {
      setSubmitError("Please enter the ES batch number.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        material_code: selectedMaterial.material_code,
        lot_number: selectedLot.lot_number,
        qty: Number(qty),
        uom_code: selectedLot.uom_code || selectedMaterial.base_uom_code,
        product_batch_no: productBatchNo,
        product_manufacture_date: productManufactureDate || null,
        created_by: "apingu", // placeholder until auth wired
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

  // Decide which UOM to show in the Quantity label
  const quantityUom =
    selectedLot?.uom_code ||
    selectedMaterial?.base_uom_code ||
    "";

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">New Consumption</div>
            <div className="modal-subtitle">
              Issue material from a specific lot into an ES product batch.
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
                  placeholder="Start typing material or code…"
                  value={materialSearch}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setSelectedMaterial(null);
                    setSelectedLot(null);
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

            {/* LOT SELECTION */}
            <div className="form-group">
              <label className="label">Lot number (released)</label>
              <select
                className="input"
                value={
                  selectedLot
                    ? `${selectedLot.material_code}-${selectedLot.lot_number}`
                    : ""
                }
                onChange={(e) => handleSelectLot(e.target.value)}
                disabled={!selectedMaterial || lotsForMaterial.length === 0}
              >
                <option value="">
                  {selectedMaterial
                    ? lotsForMaterial.length > 0
                      ? "Select lot…"
                      : "No live lots for this material"
                    : "Select a material first"}
                </option>
                {lotsForMaterial.map((lot) => (
                  <option
                    key={`${lot.material_code}-${lot.lot_number}`}
                    value={`${lot.material_code}-${lot.lot_number}`}
                  >
                    {lot.lot_number} • {lot.balance_qty} {lot.uom_code} • exp{" "}
                    {lot.expiry_date
                      ? new Date(lot.expiry_date).toLocaleDateString("en-GB")
                      : "—"}
                  </option>
                ))}
              </select>
            </div>

            {/* MANUFACTURER (auto) */}
            <div className="form-group">
              <label className="label">Manufacturer (from GRN)</label>
              <input
                className="input"
                value={manufacturer}
                readOnly
                placeholder="Auto from material / GRN"
              />
            </div>

            {/* LOT EXPIRY (read-only display) */}
            <div className="form-group">
              <label className="label">Lot expiry</label>
              <input
                className="input"
                value={
                  selectedLot && selectedLot.expiry_date
                    ? new Date(
                        selectedLot.expiry_date
                      ).toLocaleDateString("en-GB")
                    : ""
                }
                readOnly
                placeholder="Auto from lot"
              />
            </div>

            {/* QTY */}
            <div className="form-group">
              <label className="label">
                Quantity {quantityUom ? `(${quantityUom})` : ""}
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

            {/* ES BATCH */}
            <div className="form-group">
              <label className="label">ES Batch</label>
              <input
                className="input"
                placeholder="e.g. ES174424"
                value={productBatchNo}
                onChange={(e) => setProductBatchNo(e.target.value)}
              />
            </div>

            {/* PRODUCT MANUFACTURE DATE */}
            <div className="form-group">
              <label className="label">Product manufacture date</label>
              <input
                className="input"
                type="date"
                value={productManufactureDate}
                onChange={(e) => setProductManufactureDate(e.target.value)}
              />
            </div>

            {/* COMMENT */}
            <div className="form-group form-group-full">
              <label className="label">Comment</label>
              <textarea
                className="input textarea"
                placeholder="e.g. Initial issue into ES174424 – pre-weigh"
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
              {submitting ? "Posting…" : "Post consumption"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IssueModal;
