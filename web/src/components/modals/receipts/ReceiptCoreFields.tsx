import React from "react";
import type { Material } from "../../../types";

type Props = {
  isEdit: boolean;
  lockTraceabilityFields: boolean;

  materialSearch: string;
  setMaterialSearch: (v: string) => void;
  filteredMaterials: Material[];
  selectedMaterial: Material | null;
  onSelectMaterial: (m: Material) => void;
  onClearMaterial: () => void;

  lotNumber: string;
  setLotNumber: (v: string) => void;

  expiryDate: string;
  setExpiryDate: (v: string) => void;

  receiptDate: string;
  setReceiptDate: (v: string) => void;

  qty: string;
  setQty: (v: string) => void;

  totalCost: string;
  setTotalCost: (v: string) => void;

  calculatedUnitCost: number | null;
  canSuperEditLockedFields: boolean;
};

const ReceiptCoreFields: React.FC<Props> = ({
  isEdit,
  lockTraceabilityFields,

  materialSearch,
  setMaterialSearch,
  filteredMaterials,
  selectedMaterial,
  onSelectMaterial,
  onClearMaterial,

  lotNumber,
  setLotNumber,

  expiryDate,
  setExpiryDate,

  receiptDate,
  setReceiptDate,

  qty,
  setQty,

  totalCost,
  setTotalCost,

  calculatedUnitCost,
  canSuperEditLockedFields,
}) => {
  return (
    <>
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
              onClearMaterial();
            }}
          />
          {filteredMaterials.length > 0 && !selectedMaterial && !isEdit && (
            <div className="typeahead-dropdown">
              {filteredMaterials.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="typeahead-option"
                  onClick={() => onSelectMaterial(m)}
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
        <label className="label">
          Lot number{" "}
          {isEdit && lockTraceabilityFields && (
            <span style={{ color: "#94a3b8", fontWeight: 500 }}>(locked)</span>
          )}
          {isEdit && !lockTraceabilityFields && (
            <span style={{ color: "#fbbf24", fontWeight: 600 }}>(superuser)</span>
          )}
        </label>
        <input
          className="input"
          placeholder="e.g. A43621"
          value={lotNumber}
          disabled={lockTraceabilityFields}
          onChange={(e) => setLotNumber(e.target.value)}
        />
        {isEdit && !lockTraceabilityFields && canSuperEditLockedFields && (
          <div className="info-row" style={{ marginTop: 6 }}>
            Changing lot number will also affect Live Lots & Consumption references for this receipt’s lot.
          </div>
        )}
      </div>

      <div className="form-group">
        <label className="label">
          Expiry date{" "}
          {isEdit && lockTraceabilityFields && (
            <span style={{ color: "#94a3b8", fontWeight: 500 }}>(locked)</span>
          )}
          {isEdit && !lockTraceabilityFields && (
            <span style={{ color: "#fbbf24", fontWeight: 600 }}>(superuser)</span>
          )}
        </label>
        <input
          className="input"
          type="date"
          value={expiryDate}
          disabled={lockTraceabilityFields}
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
    </>
  );
};

export default ReceiptCoreFields;
