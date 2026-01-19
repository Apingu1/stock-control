import React from "react";
import type { LotBalance, Material } from "../../../types";
import { CONSUMPTION_TYPES } from "../../../constants";
import type { ConsumptionTypeCode } from "./issueHelpers";
import { formatDateShort } from "./issueHelpers";

type Props = {
  isEdit: boolean;

  consumptionType: ConsumptionTypeCode;
  setConsumptionType: (v: ConsumptionTypeCode) => void;

  canEditTraceabilityFields: boolean;

  materialSearch: string;
  setMaterialSearch: (v: string) => void;

  filteredMaterials: Material[];
  selectedMaterial: Material | null;
  onSelectMaterial: (m: Material) => void;

  lotsForMaterial: LotBalance[];
  selectedLot: LotBalance | null;
  onSelectLot: (materialLotId: string) => void;

  isQuarantined: boolean;
  onResetSelections: () => void;
};

const IssueTraceabilityFields: React.FC<Props> = ({
  isEdit,
  consumptionType,
  setConsumptionType,
  canEditTraceabilityFields,
  materialSearch,
  setMaterialSearch,
  filteredMaterials,
  selectedMaterial,
  onSelectMaterial,
  lotsForMaterial,
  selectedLot,
  onSelectLot,
  isQuarantined,
  onResetSelections,
}) => {
  return (
    <>
      <div className="form-group">
        <label className="label">Consumption type</label>
        <select
          className="input"
          value={consumptionType}
          onChange={(e) => setConsumptionType(e.target.value as ConsumptionTypeCode)}
        >
          {CONSUMPTION_TYPES.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="label">Material</label>
        <div className="typeahead-wrap">
          <input
            className="input"
            placeholder="Start typing material or code…"
            value={materialSearch}
            disabled={!canEditTraceabilityFields}
            onChange={(e) => {
              setMaterialSearch(e.target.value);
              onResetSelections();
            }}
          />

          {/* Keep behaviour: in create mode, show suggestions while nothing selected */}
          {filteredMaterials.length > 0 && !selectedMaterial && !isEdit && (
            <div className="typeahead-dropdown">
              {filteredMaterials.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  className="typeahead-option"
                  onClick={() => onSelectMaterial(m)}
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

      <div className="form-group">
        <label className="label">Lot (choose segment)</label>
        <select
          className="input"
          value={selectedLot ? String(selectedLot.material_lot_id) : ""}
          onChange={(e) => onSelectLot(e.target.value)}
          disabled={!selectedMaterial || !canEditTraceabilityFields}
        >
          <option value="">Select lot…</option>
          {lotsForMaterial.map((lot) => {
            const status = (lot.status || "").toUpperCase();
            const exp = formatDateShort(lot.expiry_date);
            const label = `${lot.lot_number} • EXP ${exp} • ${status} • ${lot.balance_qty} ${lot.uom_code}`;
            return (
              <option key={lot.material_lot_id} value={lot.material_lot_id}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

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
            <strong>Warning:</strong> This is quarantined material. Obtain QA approval prior to use.
            If already used, escalate to QA Management.
          </div>
        </div>
      )}
    </>
  );
};

export default IssueTraceabilityFields;
