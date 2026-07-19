import { Fragment, useMemo, useState } from "react";
import type { Material, Product } from "../../types";
import { apiFetch } from "../../utils/api";
import ProductModal from "./ProductModal";

type Props = {
  products: Product[];
  materials: Material[];
  loading: boolean;
  error: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canChangeStatus: boolean;
  reload: () => Promise<void>;
};

const label = (value: string) => value.replaceAll("_", " ").replace("N A", "N/A");

export default function ProductListView({ products, materials, loading, error, canCreate, canEdit, canChangeStatus, reload }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [licence, setLicence] = useState("ALL");
  const [lineType, setLineType] = useState("ALL");
  const [storage, setStorage] = useState("ALL");
  const [controlled, setControlled] = useState("ALL");
  const [exportStatus, setExportStatus] = useState("ALL");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !query || [product.product_code, product.product_name, product.reference, product.version_number, ...product.materials.flatMap((m) => [m.material_code, m.material_name])].some((value) => value.toLowerCase().includes(query));
      return matchesSearch &&
        (status === "ALL" || product.status === status) &&
        (licence === "ALL" || product.licence_status === licence) &&
        (lineType === "ALL" || product.line_type === lineType) &&
        (storage === "ALL" || product.storage_condition === storage) &&
        (controlled === "ALL" || product.controlled_drug_status === controlled) &&
        (exportStatus === "ALL" || product.export_status === exportStatus);
    });
  }, [products, search, status, licence, lineType, storage, controlled, exportStatus]);

  const toggleExpanded = (id: number) => setExpanded((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  const changeStatus = async (product: Product) => {
    const nextStatus = product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const reason = window.prompt(`Reason to ${nextStatus === "ACTIVE" ? "activate" : "inactivate"} ${product.product_code}:`);
    if (!reason?.trim()) return;
    setActionError(null);
    try {
      await apiFetch(`/products/${product.id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, reason: reason.trim() }) });
      await reload();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to change product status");
    }
  };

  return (
    <section className="content">
      <section className="card product-list-card">
        <div className="card-header">
          <div><div className="card-title">Product List</div><div className="card-subtitle">Controlled product master data and mandatory formulation materials.</div></div>
          {canCreate && <button className="btn btn-primary" onClick={() => { setEditing(null); setModalOpen(true); }}>＋ New Product</button>}
        </div>

        <div className="product-filters">
          <input className="input product-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, reference, version, or material…" />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
          <select className="input" value={licence} onChange={(e) => setLicence(e.target.value)}><option value="ALL">All licences</option><option value="LICENSED">Licensed</option><option value="UNLICENSED">Unlicensed</option></select>
          <select className="input" value={lineType} onChange={(e) => setLineType(e.target.value)}><option value="ALL">All line types</option><option value="STOCK_LINE">Stock line</option><option value="BESPOKE">Bespoke</option></select>
          <select className="input" value={storage} onChange={(e) => setStorage(e.target.value)}><option value="ALL">All storage</option><option value="FRIDGELINE">Fridgeline</option><option value="AMBIENT">Ambient</option></select>
          <select className="input" value={controlled} onChange={(e) => setControlled(e.target.value)}><option value="ALL">All CD statuses</option><option value="CONTROLLED_DRUG">Controlled drug</option><option value="N_A">CD N/A</option></select>
          <select className="input" value={exportStatus} onChange={(e) => setExportStatus(e.target.value)}><option value="ALL">All export statuses</option><option value="EXPORT_LINE">Export line</option><option value="N_A">Export N/A</option></select>
        </div>

        {(error || actionError) && <div className="error-row">{actionError || error}</div>}
        {loading ? <div className="info-row">Loading Product List…</div> : (
          <div className="table-wrapper product-table-wrap">
            <table className="product-table">
              <thead><tr><th></th><th>Product</th><th>Reference / version</th><th>Shelf life</th><th>Classifications</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((product) => {
                  const isExpanded = expanded.has(product.id);
                  return (
                    <Fragment key={product.id}>
                      <tr className="product-row" onClick={() => toggleExpanded(product.id)}>
                        <td><button className="product-expand" type="button" aria-label={isExpanded ? "Collapse materials" : "Expand materials"}>{isExpanded ? "▾" : "▸"}</button></td>
                        <td><strong>{product.product_code}</strong><div className="muted">{product.product_name}</div></td>
                        <td>{product.reference || "—"}<div className="muted">Version {product.version_number || "—"}</div></td>
                        <td>{product.shelf_life_days} days</td>
                        <td><div className="product-tags">{[product.licence_status, product.line_type, product.storage_condition, product.controlled_drug_status, product.export_status].map((value, index) => <span className="tag tag-muted" key={`${index}-${value}`}>{label(value)}</span>)}</div></td>
                        <td><span className={`disposition-badge disposition-${product.status.toLowerCase()}`}>{product.status}</span></td>
                        <td onClick={(e) => e.stopPropagation()}><div className="rowline">{canEdit && <button className="btn btn-mini" onClick={() => { setEditing(product); setModalOpen(true); }}>Edit</button>}{canChangeStatus && <button className="btn btn-mini" onClick={() => void changeStatus(product)}>{product.status === "ACTIVE" ? "Inactivate" : "Activate"}</button>}</div></td>
                      </tr>
                      {isExpanded && <tr className="product-material-row" key={`${product.id}-materials`}><td></td><td colSpan={6}><div className="product-material-expanded"><strong>Associated materials ({product.materials.length})</strong><div className="product-material-chips">{product.materials.map((material) => <span className="product-material-chip" key={material.id}><b>{material.material_code}</b> {material.material_name}<small>{material.base_uom_code}</small></span>)}</div></div></td></tr>}
                    </Fragment>
                  );
                })}
                {!filtered.length && <tr><td colSpan={7} className="muted">No products match the current search and filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ProductModal open={modalOpen} product={editing} materials={materials} onClose={() => { setModalOpen(false); setEditing(null); }} onSaved={reload} />
    </section>
  );
}
