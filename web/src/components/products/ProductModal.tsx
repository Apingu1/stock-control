import { useEffect, useMemo, useState } from "react";
import type { Material, Product } from "../../types";
import { apiFetch } from "../../utils/api";

type Props = {
  open: boolean;
  product: Product | null;
  materials: Material[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const initialFields = {
  product_code: "",
  product_name: "",
  reference: "",
  version_number: "",
  shelf_life_days: "",
  licence_status: "LICENSED",
  line_type: "STOCK_LINE",
  storage_condition: "AMBIENT",
  controlled_drug_status: "N_A",
  export_status: "N_A",
};

export default function ProductModal({ open, product, materials, onClose, onSaved }: Props) {
  const [fields, setFields] = useState(initialFields);
  const [materialIds, setMaterialIds] = useState<Set<number>>(new Set());
  const [materialSearch, setMaterialSearch] = useState("");
  const [auditReason, setAuditReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields(
      product
        ? {
            product_code: product.product_code,
            product_name: product.product_name,
            reference: product.reference,
            version_number: product.version_number,
            shelf_life_days: String(product.shelf_life_days),
            licence_status: product.licence_status,
            line_type: product.line_type,
            storage_condition: product.storage_condition,
            controlled_drug_status: product.controlled_drug_status,
            export_status: product.export_status,
          }
        : initialFields
    );
    setMaterialIds(new Set(product?.materials.map((material) => material.id) || []));
    setMaterialSearch("");
    setAuditReason("");
    setError(null);
  }, [open, product]);

  const selectableMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    return materials
      .filter((material) => !material.is_cancelled_bmr_marker)
      .filter(
        (material) =>
          !query ||
          material.material_code.toLowerCase().includes(query) ||
          material.name.toLowerCase().includes(query)
      )
      .sort((a, b) => a.material_code.localeCompare(b.material_code));
  }, [materialSearch, materials]);

  if (!open) return null;

  const setField = (key: keyof typeof initialFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const toggleMaterial = (id: number) => {
    setMaterialIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!fields.product_code.trim() || !fields.product_name.trim()) {
      setError("Product code and product name are required.");
      return;
    }
    if (!(Number(fields.shelf_life_days) > 0)) {
      setError("Shelf life must be greater than zero days.");
      return;
    }
    if (materialIds.size === 0) {
      setError("Select at least one material used in this product.");
      return;
    }
    if (!auditReason.trim()) {
      setError(product ? "Edit reason is required." : "Creation reason is required.");
      return;
    }

    const payload = {
      ...fields,
      product_code: fields.product_code.trim().toUpperCase(),
      product_name: fields.product_name.trim(),
      reference: fields.reference.trim(),
      version_number: fields.version_number.trim(),
      shelf_life_days: Number(fields.shelf_life_days),
      material_ids: [...materialIds],
      ...(product
        ? { edit_reason: auditReason.trim() }
        : { audit_reason: auditReason.trim() }),
    };

    setSaving(true);
    try {
      await apiFetch(product ? `/products/${product.id}` : "/products/", {
        method: product ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      await onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal product-modal" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{product ? "Edit Product" : "New Product"}</div>
            <div className="modal-subtitle">
              Product details and mandatory material membership are audit-trailed.
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className="product-modal-scroll">
          <div className="form-grid">
            <div className="form-group">
              <label className="label">Product code</label>
              <input className="input" value={fields.product_code} onChange={(e) => setField("product_code", e.target.value.toUpperCase())} placeholder="e.g. RAMI1" />
            </div>
            <div className="form-group">
              <label className="label">Product name</label>
              <input className="input" value={fields.product_name} onChange={(e) => setField("product_name", e.target.value)} placeholder="e.g. RAMIPRIL 2.5MG/5ML ORAL SUSPENSION" />
            </div>
            <div className="form-group">
              <label className="label">Reference</label>
              <input className="input" value={fields.reference} onChange={(e) => setField("reference", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Version number</label>
              <input className="input" value={fields.version_number} onChange={(e) => setField("version_number", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Shelf life (days)</label>
              <input className="input" type="number" min="1" value={fields.shelf_life_days} onChange={(e) => setField("shelf_life_days", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Licence</label>
              <select className="input" value={fields.licence_status} onChange={(e) => setField("licence_status", e.target.value)}>
                <option value="LICENSED">Licensed</option><option value="UNLICENSED">Unlicensed</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Line type</label>
              <select className="input" value={fields.line_type} onChange={(e) => setField("line_type", e.target.value)}>
                <option value="STOCK_LINE">Stock line</option><option value="BESPOKE">Bespoke</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Storage</label>
              <select className="input" value={fields.storage_condition} onChange={(e) => setField("storage_condition", e.target.value)}>
                <option value="AMBIENT">Ambient</option><option value="FRIDGELINE">Fridgeline</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Controlled drug</label>
              <select className="input" value={fields.controlled_drug_status} onChange={(e) => setField("controlled_drug_status", e.target.value)}>
                <option value="N_A">N/A</option><option value="CONTROLLED_DRUG">Controlled drug</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Export</label>
              <select className="input" value={fields.export_status} onChange={(e) => setField("export_status", e.target.value)}>
                <option value="N_A">N/A</option><option value="EXPORT_LINE">Export line</option>
              </select>
            </div>
          </div>

          <section className="product-material-picker">
            <div className="issue-batch-section-heading">
              <div>
                <div className="issue-batch-section-title">Mandatory materials</div>
                <div className="issue-batch-section-help">Every selected material must be present in a compliant batch.</div>
              </div>
              <span className="issue-material-count">{materialIds.size} selected</span>
            </div>
            <input className="input" value={materialSearch} onChange={(e) => setMaterialSearch(e.target.value)} placeholder="Search material code or name…" />
            <div className="product-material-options">
              {selectableMaterials.map((material) => (
                <label className={`product-material-option ${material.status !== "ACTIVE" ? "is-inactive" : ""}`} key={material.id}>
                  <input
                    type="checkbox"
                    checked={materialIds.has(material.id)}
                    onChange={() => toggleMaterial(material.id)}
                    disabled={material.status !== "ACTIVE" && !materialIds.has(material.id)}
                  />
                  <span><strong>{material.material_code}</strong> — {material.name}</span>
                  <small>{material.base_uom_code} • {material.status}</small>
                </label>
              ))}
            </div>
          </section>

          <div className="form-group">
            <label className="label">{product ? "Edit reason" : "Creation reason"} (required)</label>
            <textarea className="input textarea" value={auditReason} onChange={(e) => setAuditReason(e.target.value)} placeholder="Reason recorded in the audit trail…" />
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : product ? "Save product" : "Create product"}</button>
        </div>
      </form>
    </div>
  );
}
