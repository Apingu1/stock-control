import React, { useState } from "react";
import type { LotBalance, Material, Issue, Product } from "../../types";
import { apiFetch } from "../../utils/api";

import { useIssueForm } from "./issues/useIssueForm";
import IssueTraceabilityFields from "./issues/IssueTraceabilityFields";
import IssueProductFields from "./issues/IssueProductFields";
import BatchIssueCreateModal from "./BatchIssueCreateModal";

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
  products,
  canApproveRejectedBatch,
  canRecordCancelledBmr,
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
  products: Product[];
  canApproveRejectedBatch: boolean;
  canRecordCancelledBmr: boolean;
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

  if (!form.isEdit) {
    return (
      <BatchIssueCreateModal
        open={open}
        onClose={onClose}
        onIssuePosted={onIssuePosted}
        lotBalances={lotBalances}
        createdBy={createdBy}
        products={products}
        canApproveRejectedBatch={canApproveRejectedBatch}
        canRecordCancelledBmr={canRecordCancelledBmr}
      />
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.selectedMaterial) return void setSubmitError("Please select a material.");
    if (!form.selectedLot) return void setSubmitError("Please select a lot for this material.");
    if (!form.qty) return void setSubmitError("Please enter a quantity.");

    if (form.isBatchRequired && !form.productBatchNo.trim()) {
      setSubmitError("Please enter the ES batch number for Usage.");
      return;
    }

    if (initial?.consumption_group_id && form.isBatchRequired) {
      if (!form.esProductCode.trim() || !form.productManufactureDate) {
        setSubmitError("ES product code and manufacture date are required for grouped Usage.");
        return;
      }
      if (
        !(Number(form.totalBatchSize) > 0) ||
        !form.batchSizeUom.trim() ||
        !Number.isInteger(Number(form.numberOfUnits)) ||
        Number(form.numberOfUnits) <= 0
      ) {
        setSubmitError("Valid total batch size, unit and whole number of units are required.");
        return;
      }
    }

    if (form.consumptionType === "DESTRUCTION" && !form.comment.trim()) {
      setSubmitError("Please enter a comment explaining the destruction of stock.");
      return;
    }
    if (!createdBy?.trim()) {
      setSubmitError("Not signed in (created_by missing). Please re-login.");
      return;
    }
    if (!form.editReason.trim()) {
      setSubmitError("Edit reason is required for audit trail.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload: any = {
        qty: Number(form.qty),
        uom_code: form.selectedLot.uom_code || form.selectedMaterial.base_uom_code,
        es_product_code: form.esProductCode.trim() || null,
        product_batch_no:
          form.isBatchRequired || form.isBatchOptional
            ? form.productBatchNo.trim() || null
            : null,
        customer_name:
          form.isBatchRequired || form.isBatchOptional
            ? form.customerName.trim() || null
            : null,
        product_manufacture_date:
          form.isBatchRequired || form.isBatchOptional
            ? form.productManufactureDate || null
            : null,
        total_batch_size:
          form.isBatchRequired || form.isBatchOptional
            ? Number(form.totalBatchSize) || null
            : null,
        batch_size_uom:
          form.isBatchRequired || form.isBatchOptional
            ? form.batchSizeUom.trim() || null
            : null,
        number_of_units:
          form.isBatchRequired || form.isBatchOptional
            ? Number(form.numberOfUnits) || null
            : null,
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

      onIssuePosted();
      onClose();
    } catch (error: any) {
      console.error(error);
      setSubmitError(error.message ?? "Failed to save issue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit Consumption</div>
            <div className="modal-subtitle">
              {initial?.consumption_group_id
                ? "Quantity applies to this material; customer and batch-detail corrections apply to every linked material."
                : "Edits are audit-trailed. Provide a reason for change."}
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
              lockConsumptionType={Boolean(initial?.consumption_group_id)}
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
              products={products}
              productCodeLocked={Boolean(initial?.consumption_group_id)}
              productBatchNo={form.productBatchNo}
              setProductBatchNo={form.setProductBatchNo}
              customerName={form.customerName}
              setCustomerName={form.setCustomerName}
              productManufactureDate={form.productManufactureDate}
              setProductManufactureDate={form.setProductManufactureDate}
              totalBatchSize={form.totalBatchSize}
              setTotalBatchSize={form.setTotalBatchSize}
              batchSizeUom={form.batchSizeUom}
              setBatchSizeUom={form.setBatchSizeUom}
              numberOfUnits={form.numberOfUnits}
              setNumberOfUnits={form.setNumberOfUnits}
              consumptionType={form.consumptionType}
              comment={form.comment}
              setComment={form.setComment}
              commentLocked={initial?.batch_disposition === "REJECTED"}
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
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
