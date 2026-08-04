import React, { useEffect, useMemo, useState } from "react";
import type { Material, ExpiryThresholdRow } from "../../types";
import { apiFetch } from "../../utils/api";

import MaterialFormFields from "./materials/MaterialFormFields";
import ApprovedManufacturersSection from "./materials/ApprovedManufacturersSection";
import { useApprovedManufacturers } from "./materials/useApprovedManufacturers";
import { isOverrideEnabledFromInitial, toNumOrEmpty } from "./materials/materialFormUtils";

type MaterialFormProps = {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Material>;
  mode: "create" | "edit";
  onSaved: () => void;
  expiryThresholds: ExpiryThresholdRow[];
  canSuperEditLockedFields?: boolean;
};

const MaterialModal: React.FC<MaterialFormProps> = ({
  open,
  onClose,
  initial,
  mode,
  onSaved,
  expiryThresholds,
  canSuperEditLockedFields = false,
}) => {
  const [materialCode, setMaterialCode] = useState(initial?.material_code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryCode, setCategoryCode] = useState((initial as any)?.category_code ?? "");
  const [typeCode, setTypeCode] = useState((initial as any)?.type_code ?? "");
  const [baseUomCode, setBaseUomCode] = useState((initial as any)?.base_uom_code ?? "");
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? "");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [status, setStatus] = useState((initial as any)?.status ?? "ACTIVE");

  const [lowStockThresholdQty, setLowStockThresholdQty] = useState<number | "">(
    toNumOrEmpty((initial as any)?.low_stock_threshold_qty)
  );
  const [expiryAlertDays, setExpiryAlertDays] = useState<number | "">(
    toNumOrEmpty((initial as any)?.expiry_alert_days)
  );

  const [overrideEnabled, setOverrideEnabled] = useState<boolean>(
    isOverrideEnabledFromInitial(initial)
  );
  const [overrideDays, setOverrideDays] = useState<number | "">(
    toNumOrEmpty((initial as any)?.auto_quarantine_override_days)
  );

  const [editReason, setEditReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";
  const isTabletsCaps = categoryCode === "TABLETS_CAPSULES";
  const am = useApprovedManufacturers();

  const defaultThresholdDays = useMemo(() => {
    const row = expiryThresholds.find(
      (r) =>
        r.category_code === categoryCode &&
        r.type_code === typeCode &&
        (r as any).is_active !== false
    );
    return row?.threshold_days ?? null;
  }, [expiryThresholds, categoryCode, typeCode]);

  useEffect(() => {
    if (!open) return;

    setMaterialCode(initial?.material_code ?? "");
    setName(initial?.name ?? "");
    setCategoryCode((initial as any)?.category_code ?? "");
    setTypeCode((initial as any)?.type_code ?? "");
    setBaseUomCode((initial as any)?.base_uom_code ?? "");
    setManufacturer(initial?.manufacturer ?? "");
    setSupplier(initial?.supplier ?? "");
    setStatus((initial as any)?.status ?? "ACTIVE");

    setSubmitting(false);
    setError(null);
    setLowStockThresholdQty(toNumOrEmpty((initial as any)?.low_stock_threshold_qty));
    setExpiryAlertDays(toNumOrEmpty((initial as any)?.expiry_alert_days));

    const hasOverride = isOverrideEnabledFromInitial(initial);
    setOverrideEnabled(!!hasOverride);
    setOverrideDays(toNumOrEmpty((initial as any)?.auto_quarantine_override_days));
    setEditReason("");

    am.setNewApprovedName("");
    am.setApprovedError(null);
    am.setPendingRemoveIds(new Set());
    am.setPendingAddNames([]);

    if (mode === "edit" && initial?.material_code) {
      void am.loadApproved(initial.material_code);
    } else {
      am.setApprovedManufacturers([]);
      setMaterialCode("Loading next code…");
      void (async () => {
        try {
          const response = await apiFetch("/materials/next-code");
          const preview = (await response.json()) as { material_code?: string };
          setMaterialCode(preview.material_code || "Assigned automatically");
        } catch (previewError) {
          console.warn("Material code preview unavailable", previewError);
          setMaterialCode("Assigned automatically");
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, mode]);

  if (!open) return null;

  const validateNonNeg = (label: string, v: number | ""): string | null => {
    if (v === "") return null;
    if (!Number.isFinite(Number(v))) return `${label} must be a number.`;
    if (Number(v) < 0) return `${label} cannot be negative.`;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    am.setApprovedError(null);

    if (!name.trim()) {
      setError("Material name is required.");
      return;
    }
    if (!categoryCode.trim() || !typeCode.trim() || !baseUomCode.trim()) {
      setError("Category, type and base UOM are required.");
      return;
    }

    const v1 = validateNonNeg("Low stock threshold", lowStockThresholdQty);
    if (v1) return void setError(v1);

    const v2 = validateNonNeg("Low expiry alert days", expiryAlertDays);
    if (v2) return void setError(v2);

    if (overrideEnabled) {
      const v3 = validateNonNeg("Auto-quarantine override days", overrideDays);
      if (v3) return void setError(v3);
    }

    if (isEdit && !editReason.trim()) {
      setError("Edit reason is required for audit trail.");
      return;
    }

    setSubmitting(true);
    try {
      const d4Fields = {
        low_stock_threshold_qty:
          lowStockThresholdQty === "" ? null : Number(lowStockThresholdQty),
        expiry_alert_days: expiryAlertDays === "" ? null : Number(expiryAlertDays),
        auto_quarantine_override_days: overrideEnabled
          ? overrideDays === ""
            ? null
            : Number(overrideDays)
          : null,
      };

      if (mode === "create") {
        const payload = {
          material_code: null,
          name: name.trim(),
          category_code: categoryCode.trim(),
          type_code: typeCode.trim(),
          base_uom_code: baseUomCode.trim(),
          manufacturer: manufacturer || null,
          supplier: supplier || null,
          complies_es_criteria: true,
          status,
          ...d4Fields,
        };

        await apiFetch("/materials/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (mode === "edit" && initial?.material_code) {
        const payload = {
          name: name.trim(),
          category_code: categoryCode.trim(),
          type_code: typeCode.trim(),
          base_uom_code: baseUomCode.trim(),
          manufacturer: manufacturer || null,
          supplier: supplier || null,
          complies_es_criteria: true,
          status,
          edit_reason: editReason.trim(),
          ...d4Fields,
        };

        await apiFetch(`/materials/${encodeURIComponent(initial.material_code)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const removeIds = Array.from(am.pendingRemoveIds);
        for (const id of removeIds) {
          const qs = `?edit_reason=${encodeURIComponent(editReason.trim())}`;
          await apiFetch(
            `/materials/${encodeURIComponent(
              initial.material_code
            )}/approved-manufacturers/${id}${qs}`,
            { method: "DELETE" }
          );
        }

        for (const manuName of am.pendingAddNames) {
          const body = {
            manufacturer_name: manuName.trim(),
            edit_reason: editReason.trim(),
          };
          await apiFetch(
            `/materials/${encodeURIComponent(initial.material_code)}/approved-manufacturers`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          );
        }

        await am.loadApproved(initial.material_code);
        am.setPendingRemoveIds(new Set());
        am.setPendingAddNames([]);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to save material");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    am.setPendingRemoveIds(new Set());
    am.setPendingAddNames([]);
    am.setApprovedError(null);
    setError(null);
    onClose();
  };

  const approvedSection = (
    <ApprovedManufacturersSection
      isEdit={isEdit}
      isTabletsCaps={isTabletsCaps}
      approvedManufacturers={am.approvedManufacturers}
      approvedVisible={am.approvedVisible}
      pendingRemoveIds={am.pendingRemoveIds}
      pendingAddNames={am.pendingAddNames}
      pendingAddsNormalized={am.pendingAddsNormalized}
      newApprovedName={am.newApprovedName}
      setNewApprovedName={am.setNewApprovedName}
      loadingApproved={am.loadingApproved}
      approvedError={am.approvedError}
      setApprovedError={am.setApprovedError}
      stageDelete={am.stageDelete}
      undoDelete={am.undoDelete}
      removePendingAdd={am.removePendingAdd}
      setPendingRemoveIds={am.setPendingRemoveIds}
      setPendingAddNames={am.setPendingAddNames}
    />
  );

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Edit material" : "New material"}</div>
            <div className="modal-subtitle">
              {isEdit
                ? "Update master data for this ES material."
                : "Register a new material. Its controlled MAT code is assigned automatically."}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <MaterialFormFields
            mode={mode}
            canSuperEditLockedFields={canSuperEditLockedFields}
            materialCode={materialCode}
            setMaterialCode={setMaterialCode}
            name={name}
            setName={setName}
            categoryCode={categoryCode}
            setCategoryCode={setCategoryCode}
            typeCode={typeCode}
            setTypeCode={setTypeCode}
            baseUomCode={baseUomCode}
            setBaseUomCode={setBaseUomCode}
            manufacturer={manufacturer}
            setManufacturer={setManufacturer}
            supplier={supplier}
            setSupplier={setSupplier}
            status={status}
            setStatus={setStatus}
            lowStockThresholdQty={lowStockThresholdQty}
            setLowStockThresholdQty={setLowStockThresholdQty}
            expiryAlertDays={expiryAlertDays}
            setExpiryAlertDays={setExpiryAlertDays}
            overrideEnabled={overrideEnabled}
            setOverrideEnabled={setOverrideEnabled}
            overrideDays={overrideDays}
            setOverrideDays={setOverrideDays}
            defaultThresholdDays={defaultThresholdDays}
            isTabletsCaps={isTabletsCaps}
            editReason={editReason}
            setEditReason={setEditReason}
            approvedManufacturersSection={approvedSection}
          />

          {error && <div className="form-error">{error}</div>}

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialModal;
