import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import type { LotBalance, Material } from "../../types";
import { CONSUMPTION_TYPES } from "../../constants";

type ConsumptionTypeCode = "USAGE" | "WASTAGE" | "DESTRUCTION" | "R_AND_D";

export default function IssueModal({
  open,
  onClose,
  onIssuePosted,
  materials,
  lotBalances,
}: {
  open: boolean;
  onClose: () => void;
  onIssuePosted: () => void;
  materials: Material[];
  lotBalances: LotBalance[];
}) {
  const [consumptionType, setConsumptionType] =
    useState<ConsumptionTypeCode>("USAGE");

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
      setConsumptionType("USAGE");
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
    return lotBalances
      .filter(
        (lot) =>
          lot.material_code === selectedMaterial.material_code &&
          lot.balance_qty > 0
      )
      .sort((a, b) => {
        // nice UX: AVAILABLE first, then QUARANTINE, then REJECTED
        const rank = (s: string) => {
          const x = (s || "").toUpperCase();
          if (x === "AVAILABLE") return 1;
          if (x === "QUARANTINE") return 2;
          if (x === "REJECTED") return 3;
          return 9;
        };
        return rank(a.status) - rank(b.status);
      });
  }, [selectedMaterial, lotBalances]);

  const handleSelectMaterial = (m: Material) => {
    setSelectedMaterial(m);
    setMaterialSearch(`${m.name} (${m.material_code})`);
    setSelectedLot(null);
    setManufacturer(m.manufacturer || "");
  };

  const handleSelectLot = (lotId: string) => {
    const idNum = Number(lotId);
    const lot = lotsForMaterial.find((l) => l.material_lot_id === idNum);
    setSelectedLot(lot || null);
    if (selectedMaterial) {
      setManufacturer(selectedMaterial.manufacturer || "");
    }
  };

  const isBatchRequired = consumptionType === "USAGE";
  const isBatchOptional = consumptionType === "R_AND_D";
  const isBatchIrrelevant =
    consumptionType === "WASTAGE" || consumptionType === "DESTRUCTION";

  const showBatchFields = !isBatchIrrelevant;

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

    if (isBatchRequired && !productBatchNo.trim()) {
      setSubmitError("Please enter the ES batch number for Usage.");
      return;
    }

    if (consumptionType === "DESTRUCTION" && !comment.trim()) {
      setSubmitError(
        "Please enter a comment explaining the destruction of stock."
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        material_code: selectedMaterial.material_code,
        lot_number: selectedLot.lot_number,

        // NEW: exact segment selection (split lots safe)
        material_lot_id: selectedLot.material_lot_id,

        qty: Number(qty),
        uom_code: selectedLot.uom_code || selectedMaterial.base_uom_code,
        product_batch_no:
          isBatchRequired || isBatchOptional
            ? productBatchNo.trim() || null
            : null,
        product_manufacture_date:
          isBatchRequired || isBatchOptional
            ? productManufactureDate || null
            : null,
        consumption_type: consumptionType,
        created_by: "apingu", // placeholder until auth wired
        comment: comment || null,
        target_ref: null,
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

  const quantityUom =
    selectedLot?.uom_code || selectedMaterial?.base_uom_code || "";

  const isQuarantined =
    (selectedLot?.status || "").toUpperCase() === "QUARANTINE";

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">New Consumption</div>
            <div className="modal-subtitle">
              Issue material from a specific lot with GMP-style traceability.
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            {/* CONSUMPTION TYPE */}
            <div className="form-group">
              <label className="label">Consumption type</label>
              <select
                className="input"
                value={consumptionType}
                onChange={(e) =>
                  setConsumptionType(e.target.value as ConsumptionTypeCode)
                }
              >
                {CONSUMPTION_TYPES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

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
                        type="button"
                        key={m.id}
                        className="typeahead-option"
                        onClick={() => handleSelectMaterial(m)}
                      >
                        <div className="typeahead-main">
                          {m.name} ({m.material_code})
                        </div>
                        <div className="typeahead-meta">
                          {m.category_code} • {m.type_code}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* LOT */}
            <div className="form-group">
              <label className="label">Lot (choose segment)</label>
              <select
                className="input"
                value={selectedLot ? String(selectedLot.material_lot_id) : ""}
                onChange={(e) => handleSelectLot(e.target.value)}
                disabled={!selectedMaterial}
              >
                <option value="">Select lot…</option>
                {lotsForMaterial.map((lot) => {
                  const status = (lot.status || "").toUpperCase();
                  const label = `${lot.lot_number} • ${status} • ${lot.balance_qty} ${lot.uom_code}`;
                  return (
                    <option key={lot.material_lot_id} value={lot.material_lot_id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* QUARANTINE WARNING */}
            {isQuarantined && (
              <div className="form-group form-group-full">
                <div
                  style={{
                    border: "1px solid rgba(248,113,113,0.55)",
                    background: "rgba(248,113,113,0.10)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 13,
                    color: "#fecaca",
                  }}
                >
                  <strong>Warning:</strong> This is quarantined material. Obtain
                  QA approval prior to use. If already used, escalate to QA
                  Management.
                </div>
              </div>
            )}

            {/* QTY */}
            <div className="form-group">
              <label className="label">Quantity ({quantityUom || "uom"})</label>
              <input
                className="input"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>

            {/* MANUFACTURER (DISPLAY ONLY, CURRENT UX) */}
            <div className="form-group">
              <label className="label">Manufacturer (info)</label>
              <input
                className="input"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="(auto)"
              />
            </div>

            {/* Batch fields */}
            {showBatchFields && (
              <>
                <div className="form-group">
                  <label className="label">
                    ES batch number{" "}
                    {isBatchRequired ? "(required)" : "(optional)"}
                  </label>
                  <input
                    className="input"
                    value={productBatchNo}
                    onChange={(e) => setProductBatchNo(e.target.value)}
                    placeholder="e.g. ES000123"
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
              </>
            )}

            {/* Comment */}
            <div className="form-group form-group-full">
              <label className="label">
                Comment {consumptionType === "DESTRUCTION" ? "(required)" : ""}
              </label>
              <textarea
                className="input textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional unless destruction…"
              />
            </div>
          </div>

          {submitError && <div className="form-error">{submitError}</div>}

          <div className="modal-footer">
            <button
              className="btn-muted"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Posting…" : "Post consumption"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
