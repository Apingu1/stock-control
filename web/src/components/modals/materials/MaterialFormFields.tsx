import React from "react";
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_TYPE_OPTIONS,
  MATERIAL_UOM_OPTIONS,
} from "../../../constants";
import { toNumOrEmpty } from "./materialFormUtils";

type Props = {
  mode: "create" | "edit";
  canSuperEditLockedFields: boolean;

  materialCode: string;
  setMaterialCode: (v: string) => void;

  name: string;
  setName: (v: string) => void;

  categoryCode: string;
  setCategoryCode: (v: string) => void;

  typeCode: string;
  setTypeCode: (v: string) => void;

  baseUomCode: string;
  setBaseUomCode: (v: string) => void;

  manufacturer: string;
  setManufacturer: (v: string) => void;

  supplier: string;
  setSupplier: (v: string) => void;

  status: string;
  setStatus: (v: string) => void;

  // Phase D4
  lowStockThresholdQty: number | "";
  setLowStockThresholdQty: (v: number | "") => void;

  expiryAlertDays: number | "";
  setExpiryAlertDays: (v: number | "") => void;

  overrideEnabled: boolean;
  setOverrideEnabled: (v: boolean) => void;

  overrideDays: number | "";
  setOverrideDays: (v: number | "") => void;

  defaultThresholdDays: number | null;

  isTabletsCaps: boolean;

  // edit-only
  editReason: string;
  setEditReason: (v: string) => void;

  // approved manufacturer section slot
  approvedManufacturersSection?: React.ReactNode;
};

const MaterialFormFields: React.FC<Props> = (props) => {
  const isEdit = props.mode === "edit";

  return (
    <div className="form-grid">
      <div className="form-group">
        <label className="label">Material code</label>
        <input
          className="input"
          placeholder="e.g. MAT0327"
          value={props.materialCode}
          onChange={(e) => props.setMaterialCode(e.target.value)}
          disabled={isEdit}
        />
      </div>

      <div className="form-group">
        <label className="label">Material name</label>
        <input
          className="input"
          placeholder="e.g. Paracetamol Powder"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          disabled={isEdit && !props.canSuperEditLockedFields}
        />
      </div>

      <div className="form-group">
        <label className="label">Category</label>
        <select
          className="input"
          value={props.categoryCode}
          onChange={(e) => props.setCategoryCode(e.target.value)}
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
          value={props.typeCode}
          onChange={(e) => props.setTypeCode(e.target.value)}
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
          value={props.baseUomCode}
          onChange={(e) => props.setBaseUomCode(e.target.value)}
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
          value={props.status}
          onChange={(e) => props.setStatus(e.target.value)}
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
      </div>

      <div className="form-group">
        <label className="label">Default manufacturer</label>
        <input
          className="input"
          placeholder="e.g. Zentiva"
          value={props.manufacturer}
          onChange={(e) => props.setManufacturer(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="label">Default supplier</label>
        <input
          className="input"
          placeholder="e.g. MEDI HEALTH"
          value={props.supplier}
          onChange={(e) => props.setSupplier(e.target.value)}
        />
      </div>

      {/* Phase D4: Alerts & Quarantine */}
      <div className="form-group form-group-full">
        <label className="label">Alerts &amp; Quarantine</label>
        <div className="content-subtitle" style={{ marginBottom: 10 }}>
          Configure per-material low stock + low expiry alerts, and optionally override the
          auto-quarantine threshold.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="label">Low stock threshold qty (base UOM)</label>
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              value={props.lowStockThresholdQty}
              onChange={(e) => props.setLowStockThresholdQty(toNumOrEmpty(e.target.value))}
              placeholder="e.g. 10"
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="label">Low expiry alert days</label>
            <input
              className="input"
              type="number"
              min={0}
              step="1"
              value={props.expiryAlertDays}
              onChange={(e) => props.setExpiryAlertDays(toNumOrEmpty(e.target.value))}
              placeholder="e.g. 60"
            />
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="info-row" style={{ marginBottom: 6 }}>
            Default auto-quarantine:{" "}
            <strong>{props.defaultThresholdDays === null ? "—" : `${props.defaultThresholdDays} days`}</strong>{" "}
            <span className="muted">(from Settings)</span>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={props.overrideEnabled}
              onChange={(e) => {
                const on = e.target.checked;
                props.setOverrideEnabled(on);
                if (!on) props.setOverrideDays("");
              }}
            />
            <span>Override default auto-quarantine days</span>
          </label>

          {props.overrideEnabled && (
            <div style={{ marginTop: 8, maxWidth: 240 }}>
              <input
                className="input"
                type="number"
                min={0}
                step="1"
                value={props.overrideDays}
                onChange={(e) => props.setOverrideDays(toNumOrEmpty(e.target.value))}
                placeholder="e.g. 30"
              />
            </div>
          )}
        </div>
      </div>

      {isEdit && (
        <div className="form-group form-group-full">
          <label className="label">
            Edit reason <span style={{ color: "#fca5a5" }}>(required)</span>
          </label>
          <textarea
            className="input textarea"
            value={props.editReason}
            onChange={(e) => props.setEditReason(e.target.value)}
            placeholder="Explain what changed and why (audit trail)…"
          />
        </div>
      )}

      {/* Approved manufacturers block (only when tablets/caps + edit) */}
      {props.approvedManufacturersSection}

      {!isEdit && props.isTabletsCaps && (
        <div className="form-group form-group-full">
          <label className="label">Approved manufacturers</label>
          <p className="content-subtitle">
            Save the material first, then edit it to configure the list of approved
            manufacturers for TABLETS/CAPSULES.
          </p>
        </div>
      )}
    </div>
  );
};

export default MaterialFormFields;
