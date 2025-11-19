import React, { useEffect, useState } from "react";
import type { Material } from "../../types";
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_TYPE_OPTIONS,
  MATERIAL_UOM_OPTIONS,
} from "../../constants";
import { apiFetch } from "../../utils/api";

type MaterialFormProps = {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Material>;
  mode: "create" | "edit";
  onSaved: () => void;
};

const MaterialModal: React.FC<MaterialFormProps> = ({
  open,
  onClose,
  initial,
  mode,
  onSaved,
}) => {
  const [materialCode, setMaterialCode] = useState(
    initial?.material_code ?? ""
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryCode, setCategoryCode] = useState(
    initial?.category_code ?? MATERIAL_CATEGORY_OPTIONS[0]
  );
  const [typeCode, setTypeCode] = useState(
    initial?.type_code ?? MATERIAL_TYPE_OPTIONS[0]
  );
  const [baseUomCode, setBaseUomCode] = useState(
    initial?.base_uom_code ?? MATERIAL_UOM_OPTIONS[0]
  );
  const [manufacturer, setManufacturer] = useState(
    initial?.manufacturer ?? ""
  );
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [compliesEs, setCompliesEs] = useState(
    initial?.complies_es_criteria ?? true
  );
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMaterialCode(initial?.material_code ?? "");
      setName(initial?.name ?? "");
      setCategoryCode(
        initial?.category_code ?? MATERIAL_CATEGORY_OPTIONS[0]
      );
      setTypeCode(initial?.type_code ?? MATERIAL_TYPE_OPTIONS[0]);
      setBaseUomCode(
        initial?.base_uom_code ?? MATERIAL_UOM_OPTIONS[0]
      );
      setManufacturer(initial?.manufacturer ?? "");
      setSupplier(initial?.supplier ?? "");
      setCompliesEs(initial?.complies_es_criteria ?? true);
      setStatus(initial?.status ?? "ACTIVE");
      setSubmitting(false);
      setError(null);
    }
  }, [open, initial, mode]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!materialCode.trim() && mode === "create") {
      setError("Material code is required.");
      return;
    }
    if (!name.trim()) {
      setError("Material name is required.");
      return;
    }
    if (!categoryCode.trim() || !typeCode.trim() || !baseUomCode.trim()) {
      setError("Category, type and base UOM are required.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const payload = {
          material_code: materialCode.trim(),
          name: name.trim(),
          category_code: categoryCode.trim(),
          type_code: typeCode.trim(),
          base_uom_code: baseUomCode.trim(),
          manufacturer: manufacturer || null,
          supplier: supplier || null,
          complies_es_criteria: compliesEs,
          status,
          created_by: "apingu",
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
          complies_es_criteria: compliesEs,
          status,
        };

        await apiFetch(
          `/materials/${encodeURIComponent(initial.material_code)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
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

  const isEdit = mode === "edit";

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {isEdit ? "Edit material" : "New material"}
            </div>
            <div className="modal-subtitle">
              {isEdit
                ? "Update master data for this ES material."
                : "Register a new material into the ES master list."}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="label">Material code</label>
              <input
                className="input"
                placeholder="e.g. MAT0327"
                value={materialCode}
                onChange={(e) => setMaterialCode(e.target.value)}
                disabled={isEdit}
              />
            </div>
            <div className="form-group">
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. RAMIPRIL 10MG TABLETS"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Category</label>
              <select
                className="input"
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value)}
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
                value={typeCode}
                onChange={(e) => setTypeCode(e.target.value)}
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
                value={baseUomCode}
                onChange={(e) => setBaseUomCode(e.target.value)}
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
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="OBSOLETE">OBSOLETE</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </div>

            <div className="form-group">
              <label className="label">Manufacturer</label>
              <input
                className="input"
                placeholder="e.g. SMS Life Sciences"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="label">Supplier</label>
              <input
                className="input"
                placeholder="e.g. APS"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>

            <div className="form-group form-group-full">
              <label className="label">ES criteria</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <input
                  id="complies-es-checkbox"
                  type="checkbox"
                  checked={compliesEs}
                  onChange={(e) => setCompliesEs(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <label
                  htmlFor="complies-es-checkbox"
                  style={{ cursor: "pointer" }}
                >
                  Material complies with licensed finished product ES criteria
                </label>
              </div>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

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
              {submitting
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                ? "Save changes"
                : "Create material"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MaterialModal;
