import React, { useState } from "react";
import type { Material, Receipt } from "../../types";
import { apiFetch } from "../../utils/api";

import { useReceiptForm } from "./receipts/useReceiptForm";
import ReceiptCoreFields from "./receipts/ReceiptCoreFields";
import ReceiptManufacturerFields from "./receipts/ReceiptManufacturerFields";
import ReceiptComplianceFields from "./receipts/ReceiptComplianceFields";

type NewReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  onReceiptPosted: () => void;

  mode?: "create" | "edit";
  initial?: Receipt;

  // Phase D5
  canSuperEditLockedFields?: boolean;
};

const NewReceiptModal: React.FC<NewReceiptModalProps> = ({
  open,
  onClose,
  materials,
  onReceiptPosted,
  mode = "create",
  initial,
  canSuperEditLockedFields = false,
}) => {
  const form = useReceiptForm({
    open,
    mode,
    initial,
    materials,
    canSuperEditLockedFields,
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Match existing behaviour:
    if (!form.selectedMaterial && !form.isEdit) {
      setSubmitError("Please select a material.");
      return;
    }
    if (!form.qty) {
      setSubmitError("Please enter a quantity.");
      return;
    }
    if (!form.receiptDate && !form.isEdit) {
      setSubmitError("Please enter a receipt date.");
      return;
    }

    // Require total cost for both create and edit (as in current file)
    if (!form.totalCost || Number(form.totalCost) <= 0) {
      setSubmitError("Please enter the total cost (£) for this receipt line.");
      return;
    }

    // TABLETS_CAPSULES control
    if (form.isTabletsCaps && !form.hasApproved) {
      setSubmitError(
        "No approved manufacturers are configured for this TABLETS/CAPSULES material. Add one in Materials before booking in."
      );
      return;
    }
    if (form.isTabletsCaps && !form.manufacturer) {
      setSubmitError("Please select an approved manufacturer.");
      return;
    }

    if (!form.compliesEs && !form.isEdit) {
      setSubmitError("Ensure goods in comply with ES criteria specified in ES.SOP.112");
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
          material_code: form.selectedMaterial!.material_code,
          lot_number: form.lotNumber || null,
          expiry_date: form.expiryDate || null,
          receipt_date: form.receiptDate,
          qty: Number(form.qty),
          uom_code: form.selectedMaterial!.base_uom_code,

          // D1: send total_value; backend derives unit_price
          total_value: form.totalCost ? Number(form.totalCost) : null,
          unit_price: null,

          supplier: form.supplier || null,
          manufacturer: form.manufacturer || null,
          complies_es_criteria: form.compliesEs,
        };

        await apiFetch("/receipts/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        const payload: any = {
          qty: Number(form.qty),

          total_value: form.totalCost ? Number(form.totalCost) : null,
          unit_price: null,

          supplier: form.supplier || null,
          manufacturer: form.manufacturer || null,
          edit_reason: form.editReason.trim(),
        };

        if (form.canSuperEditLockedFields) {
          payload.lot_number = form.lotNumber || null;
          payload.expiry_date = form.expiryDate || null;
        }

        await apiFetch(`/receipts/${initial!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      onReceiptPosted();
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err?.message ?? "Failed to save receipt.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{form.isEdit ? "Edit goods receipt" : "New goods receipt"}</div>
            <div className="modal-subtitle">
              {form.isEdit
                ? "Edits are audit-trailed. Provide a reason for change."
                : "Post an incoming delivery into ES stock."}
            </div>
          </div>

          <button
            type="button"
            className="icon-btn"
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
            <ReceiptCoreFields
              isEdit={form.isEdit}
              lockTraceabilityFields={form.lockTraceabilityFields}
              materialSearch={form.materialSearch}
              setMaterialSearch={form.setMaterialSearch}
              filteredMaterials={form.filteredMaterials}
              selectedMaterial={form.selectedMaterial}
              onSelectMaterial={form.handleSelectMaterial}
              onClearMaterial={() => {
                form.setSelectedMaterial(null);
                form.setManufacturer("");
              }}
              lotNumber={form.lotNumber}
              setLotNumber={form.setLotNumber}
              expiryDate={form.expiryDate}
              setExpiryDate={form.setExpiryDate}
              receiptDate={form.receiptDate}
              setReceiptDate={form.setReceiptDate}
              qty={form.qty}
              setQty={form.setQty}
              totalCost={form.totalCost}
              setTotalCost={form.setTotalCost}
              calculatedUnitCost={form.calculatedUnitCost}
              canSuperEditLockedFields={form.canSuperEditLockedFields}
            />

            <ReceiptManufacturerFields
              supplier={form.supplier}
              setSupplier={form.setSupplier}
              manufacturer={form.manufacturer}
              setManufacturer={form.setManufacturer}
              isTabletsCaps={form.isTabletsCaps}
              hasApproved={form.hasApproved}
              approvedForMaterial={form.approvedForMaterial}
            />

            <ReceiptComplianceFields
              isEdit={form.isEdit}
              compliesEs={form.compliesEs}
              setCompliesEs={form.setCompliesEs}
              editReason={form.editReason}
              setEditReason={form.setEditReason}
            />
          </div>

          {submitError && <div className="error-row">{submitError}</div>}

          <div className="modal-footer">
            <button type="button" className="btn secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn" disabled={submitting}>
              {submitting ? "Saving…" : form.isEdit ? "Save changes" : "Post receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewReceiptModal;
