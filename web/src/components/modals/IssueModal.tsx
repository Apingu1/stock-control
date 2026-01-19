import React, { useState } from "react";
import type { LotBalance, Material, Issue } from "../../types";
import { apiFetch } from "../../utils/api";

import { useIssueForm } from "./issues/useIssueForm";
import IssueTraceabilityFields from "./issues/IssueTraceabilityFields";
import IssueProductFields from "./issues/IssueProductFields";

export default function IssueModal({
  open,
  onClose,
  onIssuePosted,
  materials,
  lotBalances,
  createdBy,
  mode = "create",
  initial,
  canSuperEditLockedFields = false,
}: {
  open: boolean;
  onClose: () => void;
  onIssuePosted: () => void;
  materials: Material[];
  lotBalances: LotBalance[];
  createdBy: string;

  mode?: "create" | "edit";
  initial?: Issue;
  canSuperEditLockedFields?: boolean;
}) {
  const form = useIssueForm({
    open,
    mode,
    initial,
    materials,
    lotBalances,
    canSuperEditLockedFields,
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.selectedMaterial) {
      setSubmitError("Please select a material.");
      return;
    }
    if (!form.selectedLot) {
      setSubmitError("Please select a lot for this material.");
      return;
    }
    if (!form.qty) {
      setSubmitError("Please enter a quantity.");
      return;
    }

    if (form.isBatchRequired && !form.productBatchNo.trim()) {
      setSubmitError("Please enter the ES batch number for Usage.");
      return;
    }

    if (form.consumptionType === "DESTRUCTION" && !form.comment.trim()) {
      setSubmitError("Please enter a comment explaining the destruction of stock.");
      return;
    }

    if (!createdBy?.trim()) {
      setSubmitError("Not signed in (created_by missing). Please re-login.");
      return;
    }

    if (form.isEdit && !form.editReason.trim()) {
      setSubmitError("Edit reason is required for audit trail.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!form.isEdit) {
        const payload = {
          material_code: form.selectedMaterial.material_code,
          lot_number: form.selectedLot.lot_number,
          material_lot_id: form.selectedLot.material_lot_id,

          qty: Number(form.qty),
          uom_code: form.selectedLot.uom_code || form.selectedMaterial.base_uom_code,

          es_product_code: form.esProductCode.trim() || null,

          product_batch_no:
            form.isBatchRequired || form.isBatchOptional ? form.productBatchNo.trim() || null : null,
          product_manufacture_date:
            form.isBatchRequired || form.isBatchOptional ? form.productManufactureDate || null : null,

          consumption_type: form.consumptionType,
          created_by: createdBy,

          comment: form.comment || null,
          manufacturer: form.manufacturer || null,
          target_ref: null,
        };

        await apiFetch("/issues/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        const payload: any = {
          qty: Number(form.qty),
          uom_code: form.selectedLot.uom_code || form.selectedMaterial.base_uom_code,

          es_product_code: form.esProductCode.trim() || null,

          product_batch_no:
            form.isBatchRequired || form.isBatchOptional ? form.productBatchNo.trim() || null : null,
          product_manufacture_date:
            form.isBatchRequired || form.isBatchOptional ? form.productManufactureDate || null : null,

          consumption_type: form.consumptionType,
          comment: form.comment || null,
          target_ref: null,
          edit_reason: form.editReason.trim(),
        };

        if (canSuperEditLockedFields) {
          payload.material_code = form.selectedMaterial.material_code;
          payload.lot_number = form.selectedLot.lot_number;
          payload.material_lot_id = form.selectedLot.material_lot_id;
        }

        await apiFetch(`/issues/${initial!.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }

      onIssuePosted();
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message ?? "Failed to save issue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{form.isEdit ? "Edit Consumption" : "New Consumption"}</div>
            <div className="modal-subtitle">
              {form.isEdit
                ? "Edits are audit-trailed. Provide a reason for change."
                : "Issue material from a specific lot with GMP-style traceability."}
            </div>
          </div>

          <button
            className="icon-btn"
            type="button"
            onClick={() => {
              setSubmitError(null);
              onClose();
            }}
          >
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            <IssueTraceabilityFields
              isEdit={form.isEdit}
              consumptionType={form.consumptionType}
              setConsumptionType={form.setConsumptionType}
              canEditTraceabilityFields={form.canEditTraceabilityFields}
              materialSearch={form.materialSearch}
              setMaterialSearch={form.setMaterialSearch}
              filteredMaterials={form.filteredMaterials}
              selectedMaterial={form.selectedMaterial}
              onSelectMaterial={form.handleSelectMaterial}
              lotsForMaterial={form.lotsForMaterial}
              selectedLot={form.selectedLot}
              onSelectLot={form.handleSelectLot}
              isQuarantined={form.isQuarantined}
              onResetSelections={() => {
                form.setSelectedMaterial(null);
                form.setSelectedLot(null);
                form.setManufacturer("");
              }}
            />

            <IssueProductFields
              showBatchFields={form.showBatchFields}
              isBatchRequired={form.isBatchRequired}
              quantityUom={form.quantityUom}
              qty={form.qty}
              setQty={form.setQty}
              manufacturer={form.manufacturer}
              setManufacturer={form.setManufacturer}
              esProductCode={form.esProductCode}
              setEsProductCode={form.setEsProductCode}
              productBatchNo={form.productBatchNo}
              setProductBatchNo={form.setProductBatchNo}
              productManufactureDate={form.productManufactureDate}
              setProductManufactureDate={form.setProductManufactureDate}
              consumptionType={form.consumptionType}
              comment={form.comment}
              setComment={form.setComment}
              isEdit={form.isEdit}
              editReason={form.editReason}
              setEditReason={form.setEditReason}
            />
          </div>

          {submitError && <div className="form-error">{submitError}</div>}

          <div className="modal-footer">
            <button
              className="btn-muted"
              type="button"
              onClick={() => {
                setSubmitError(null);
                onClose();
              }}
              disabled={submitting}
            >
              Cancel
            </button>

            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Saving…" : form.isEdit ? "Save changes" : "Post consumption"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
