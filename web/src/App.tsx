import React, { useEffect, useMemo, useState } from "react";

type LotBalance = {
  material_code: string;
  material_name: string;
  lot_number: string;
  expiry_date: string | null;
  status: string;
  balance_qty: number;
  uom_code: string;
};

type Material = {
  id: number;
  material_code: string;
  name: string;
  category_code: string;
  type_code: string;
  base_uom_code: string;
  manufacturer: string | null;
  supplier: string | null;
  complies_es_criteria: boolean;
  status: string;
};

type ViewMode = "dashboard" | "materials";

// ---- Static lookup options --------------------------------------------------
// Adjust these if you ever tweak the DB lookup codes

const MATERIAL_CATEGORY_OPTIONS: string[] = [
  "SOLID_RAW_MAT",
  "LIQUID_RAW_MAT",
  "TABLETS_CAPSULES",
  "CREAMS_OINTMENTS",
  "AMPOULES",
  "PACKAGING",
  "WAREHOUSE_ITEMS",
  "NA",
];

const MATERIAL_TYPE_OPTIONS: string[] = [
  "API",
  "PROD_API",
  "EXCIPIENT",
  "PACKAGING",
  "OTHER",
];

const MATERIAL_UOM_OPTIONS: string[] = [
  "G",
  "KG",
  "MG",
  "ML",
  "L",
  "TAB",
  "CAP",
  "AMP",
  "NA",
];

// ---- Helpers ----------------------------------------------------------------

function formatDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    console.error("API error on", path, res.status, text);
    throw new Error(`HTTP ${res.status}: ${text || "No body"}`);
  }
  return res;
}

// ---- New Goods Receipt Modal -----------------------------------------------

type NewReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  onReceiptPosted: () => void;
};

const NewReceiptModal: React.FC<NewReceiptModalProps> = ({
  open,
  onClose,
  materials,
  onReceiptPosted,
}) => {
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null
  );
  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [targetRef, setTargetRef] = useState("");
  const [supplier, setSupplier] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [comment, setComment] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form each time modal opens
  useEffect(() => {
    if (open) {
      setMaterialSearch("");
      setSelectedMaterial(null);
      setLotNumber("");
      setExpiryDate("");
      setQty("");
      setUnitPrice("");
      setTargetRef("");
      setSupplier("");
      setManufacturer("");
      setComment("");
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials.slice(0, 15);
    return materials
      .filter(
        (m) =>
          m.material_code.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [materialSearch, materials]);

  const handleSelectMaterial = (m: Material) => {
    // Only select material + update text; no auto-fill supplier/manufacturer
    setSelectedMaterial(m);
    setMaterialSearch(`${m.name} (${m.material_code})`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial) {
      setSubmitError("Please select a material from the list.");
      return;
    }
    if (!qty) {
      setSubmitError("Please enter a quantity.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        material_code: selectedMaterial.material_code,
        lot_number: lotNumber || null,
        expiry_date: expiryDate || null,
        qty: Number(qty),
        uom_code: selectedMaterial.base_uom_code,
        unit_price: unitPrice ? Number(unitPrice) : null,
        target_ref: targetRef || null,
        supplier: supplier || null,
        manufacturer: manufacturer || null,
        comment: comment || null,
        created_by: "apingu", // placeholder until auth is wired
      };

      await apiFetch("/receipts/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onReceiptPosted();
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message ?? "Failed to post receipt");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">New Goods Receipt</div>
            <div className="modal-subtitle">
              Post a new receipt into the stock ledger.
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            {/* MATERIAL (left) */}
            <div className="form-group">
              <label className="label">Material</label>
              <div className="typeahead-wrap">
                <input
                  className="input"
                  placeholder="e.g. RAMIPRIL 10MG (MAT0327)"
                  value={materialSearch}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setSelectedMaterial(null);
                  }}
                />
                {filteredMaterials.length > 0 && (
                  <div className="typeahead-dropdown">
                    {filteredMaterials.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="typeahead-option"
                        onClick={() => handleSelectMaterial(m)}
                      >
                        <div className="typeahead-main">{m.name}</div>
                        <div className="typeahead-meta">
                          {m.material_code} •{" "}
                          {m.manufacturer || m.supplier || "No supplier set"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* LOT NUMBER (right) */}
            <div className="form-group">
              <label className="label">Lot number</label>
              <input
                className="input"
                placeholder="e.g. 4P3611A"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
              />
            </div>

            {/* EXPIRY / QUANTITY */}
            <div className="form-group">
              <label className="label">Expiry date</label>
              <input
                className="input"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">
                Quantity{" "}
                {selectedMaterial ? `(${selectedMaterial.base_uom_code})` : ""}
              </label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.001"
                placeholder="e.g. 280"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>

            {/* UNIT PRICE / GRN */}
            <div className="form-group">
              <label className="label">Unit price (£)</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.0001"
                placeholder="e.g. 0.025"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">GRN / Reference</label>
              <input
                className="input"
                placeholder="e.g. GRN-001 or delivery note"
                value={targetRef}
                onChange={(e) => setTargetRef(e.target.value)}
              />
            </div>

            {/* SUPPLIER / MANUFACTURER */}
            <div className="form-group">
              <label className="label">Supplier</label>
              <input
                className="input"
                placeholder="e.g. MEDI HEALTH"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="label">Manufacturer</label>
              <input
                className="input"
                placeholder="e.g. Zentiva"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
              />
            </div>

            {/* COMMENT – full row */}
            <div className="form-group form-group-full">
              <label className="label">Comment</label>
              <textarea
                className="input textarea"
                placeholder="e.g. Initial booking from delivery note"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>

          {submitError && <div className="form-error">{submitError}</div>}

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
              {submitting ? "Posting…" : "Post receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---- Issues & Consumption Modal --------------------------------------------

type IssueModalProps = {
  open: boolean;
  onClose: () => void;
  materials: Material[];
  lotBalances: LotBalance[];
  onIssuePosted: () => void;
};

const IssueModal: React.FC<IssueModalProps> = ({
  open,
  onClose,
  materials,
  lotBalances,
  onIssuePosted,
}) => {
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(
    null
  );
  const [selectedLotNumber, setSelectedLotNumber] = useState("");
  const [qty, setQty] = useState("");
  const [productBatchNo, setProductBatchNo] = useState("");
  const [productManufactureDate, setProductManufactureDate] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form each time modal opens
  useEffect(() => {
    if (open) {
      setMaterialSearch("");
      setSelectedMaterial(null);
      setSelectedLotNumber("");
      setQty("");
      setProductBatchNo("");
      setProductManufactureDate("");
      setComment("");
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials.slice(0, 15);
    return materials
      .filter(
        (m) =>
          m.material_code.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [materialSearch, materials]);

  const handleSelectMaterial = (m: Material) => {
    setSelectedMaterial(m);
    setMaterialSearch(`${m.name} (${m.material_code})`);
    setSelectedLotNumber("");
  };

  // Lots for the selected material with a positive balance
  const availableLots = useMemo(() => {
    if (!selectedMaterial) return [];
    return lotBalances.filter(
      (lot) =>
        lot.material_code === selectedMaterial.material_code &&
        lot.balance_qty > 0
    );
  }, [lotBalances, selectedMaterial]);

  const selectedLot = useMemo(
    () =>
      availableLots.find((l) => l.lot_number === selectedLotNumber) || null,
    [availableLots, selectedLotNumber]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedMaterial) {
      setSubmitError("Please select a material.");
      return;
    }
    if (!selectedLot) {
      setSubmitError("Please select a lot to issue from.");
      return;
    }
    if (!qty) {
      setSubmitError("Please enter a quantity to issue.");
      return;
    }

    const numericQty = Number(qty);
    if (!numericQty || numericQty <= 0) {
      setSubmitError("Quantity must be a positive number.");
      return;
    }
    if (numericQty > selectedLot.balance_qty) {
      setSubmitError(
        `You cannot issue more than the available balance (${selectedLot.balance_qty} ${selectedLot.uom_code}).`
      );
      return;
    }

    if (!productBatchNo.trim()) {
      setSubmitError("Please enter the ES product batch number.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        material_code: selectedMaterial.material_code,
        lot_number: selectedLot.lot_number,
        qty: numericQty,
        uom_code: selectedLot.uom_code || selectedMaterial.base_uom_code,
        product_batch_no: productBatchNo.trim(),
        product_manufacture_date: productManufactureDate
          ? new Date(productManufactureDate).toISOString()
          : null,
        created_by: "apingu", // placeholder until auth is wired
        comment: comment || null,
      };

      await apiFetch("/issues/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      onIssuePosted();
      onClose();
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message ?? "Failed to post issue");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">Issues &amp; Consumption</div>
            <div className="modal-subtitle">
              Draw stock from a specific lot and capture ES batch usage.
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Body */}
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-grid">
            {/* MATERIAL SELECT */}
            <div className="form-group">
              <label className="label">Material</label>
              <div className="typeahead-wrap">
                <input
                  className="input"
                  placeholder="Search by name or code..."
                  value={materialSearch}
                  onChange={(e) => {
                    setMaterialSearch(e.target.value);
                    setSelectedMaterial(null);
                    setSelectedLotNumber("");
                  }}
                />
                {filteredMaterials.length > 0 && (
                  <div className="typeahead-dropdown">
                    {filteredMaterials.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="typeahead-option"
                        onClick={() => handleSelectMaterial(m)}
                      >
                        <div className="typeahead-main">{m.name}</div>
                        <div className="typeahead-meta">
                          {m.material_code} •{" "}
                          {m.manufacturer || m.supplier || "No supplier set"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* LOT SELECT */}
            <div className="form-group">
              <label className="label">Issue from lot</label>
              <select
                className="input"
                value={selectedLotNumber}
                onChange={(e) => setSelectedLotNumber(e.target.value)}
                disabled={!selectedMaterial || availableLots.length === 0}
              >
                <option value="">
                  {selectedMaterial
                    ? availableLots.length > 0
                      ? "Select a lot…"
                      : "No lots with available balance"
                    : "Select a material first"}
                </option>
                {availableLots.map((lot) => (
                  <option key={lot.lot_number} value={lot.lot_number}>
                    {lot.lot_number} • {formatDate(lot.expiry_date)} •{" "}
                    {lot.balance_qty} {lot.uom_code}
                  </option>
                ))}
              </select>
            </div>

            {/* QTY + UOM */}
            <div className="form-group">
              <label className="label">
                Quantity to issue{" "}
                {selectedLot
                  ? `(${selectedLot.uom_code})`
                  : selectedMaterial
                  ? `(${selectedMaterial.base_uom_code})`
                  : ""}
              </label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. 150"
              />
              {selectedLot && (
                <div className="alert-meta" style={{ marginTop: 4 }}>
                  Available:{" "}
                  <strong>
                    {selectedLot.balance_qty} {selectedLot.uom_code}
                  </strong>
                </div>
              )}
            </div>

            {/* ES PRODUCT BATCH */}
            <div className="form-group">
              <label className="label">ES product batch no.</label>
              <input
                className="input"
                placeholder="e.g. ES000123"
                value={productBatchNo}
                onChange={(e) => setProductBatchNo(e.target.value)}
              />
            </div>

            {/* MANUFACTURE DATE */}
            <div className="form-group">
              <label className="label">Product manufacture date</label>
              <input
                className="input"
                type="date"
                value={productManufactureDate}
                onChange={(e) => setProductManufactureDate(e.target.value)}
              />
            </div>

            {/* COMMENT */}
            <div className="form-group form-group-full">
              <label className="label">Comment</label>
              <textarea
                className="input textarea"
                placeholder="e.g. Weighed into ES000123 during dispensing."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </div>

          {submitError && <div className="form-error">{submitError}</div>}

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
              {submitting ? "Posting…" : "Post issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---- Materials Library Modals ----------------------------------------------

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

            {/* Category */}
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

            {/* Type */}
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

            {/* Base UOM */}
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

// ---- Main App ---------------------------------------------------------------

const App: React.FC = () => {
  const [lotBalances, setLotBalances] = useState<LotBalance[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState<string | null>(null);

  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);

  const [view, setView] = useState<ViewMode>("dashboard");
  const [materialsSearch, setMaterialsSearch] = useState("");
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  // Filters for materials library
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const loadLotBalances = async () => {
    try {
      setLoadingLots(true);
      setLotsError(null);
      const res = await apiFetch("/lot-balances/");
      const data = (await res.json()) as LotBalance[];
      setLotBalances(data);
    } catch (e: any) {
      console.error(e);
      setLotsError(e?.message ?? "Failed to load lot balances");
    } finally {
      setLoadingLots(false);
    }
  };

  const loadMaterials = async () => {
    try {
      const res = await apiFetch("/materials/?limit=500");
      const data = (await res.json()) as Material[];
      setMaterials(data);
    } catch (e) {
      console.error("Failed to load materials", e);
    }
  };

  useEffect(() => {
    void loadLotBalances();
    void loadMaterials();
  }, []);

  const libraryFilteredMaterials = useMemo(() => {
    const q = materialsSearch.trim().toLowerCase();

    return materials.filter((m) => {
      if (categoryFilter !== "ALL" && m.category_code !== categoryFilter) {
        return false;
      }
      if (typeFilter !== "ALL" && m.type_code !== typeFilter) {
        return false;
      }

      if (!q) return true;

      return (
        m.material_code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.manufacturer || "").toLowerCase().includes(q) ||
        (m.supplier || "").toLowerCase().includes(q)
      );
    });
  }, [materials, materialsSearch, categoryFilter, typeFilter]);

  const handleMaterialSaved = async () => {
    await loadMaterials();
  };

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">SC</div>
          <div>
            <div className="sidebar-title-main">Digital Stock</div>
            <div className="sidebar-title-sub">Control Studio</div>
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <ul className="nav-list">
          <li className="nav-item">
            <button
              type="button"
              className={
                "nav-link as-button " +
                (view === "dashboard" ? "active" : "")
              }
              onClick={() => setView("dashboard")}
            >
              <span className="icon">📊</span>
              Dashboard
              <span className="badge">Today</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={
                "nav-link as-button " + (view === "materials" ? "active" : "")
              }
              onClick={() => setView("materials")}
            >
              <span className="icon">🧪</span>
              Materials Library
            </button>
          </li>
          <li className="nav-item">
            <button
              className="nav-link as-button"
              type="button"
              onClick={() => setShowReceiptModal(true)}
            >
              <span className="icon">📥</span>
              Goods Receipt
            </button>
          </li>
          <li className="nav-item">
            <button
              className="nav-link as-button"
              type="button"
              onClick={() => setShowIssueModal(true)}
            >
              <span className="icon">🚚</span>
              Issues &amp; Consumption
            </button>
          </li>
        </ul>

        <div className="sidebar-section-label">Risk &amp; Quality</div>
        <ul className="nav-list">
          <li className="nav-item">
            <a href="#" className="nav-link">
              <span className="icon">⏰</span>
              Expiry Watchlist
              <span className="badge">12</span>
            </a>
          </li>
          <li className="nav-item">
            <a href="#" className="nav-link">
              <span className="icon">📦</span>
              Quarantine
              <span className="badge">4</span>
            </a>
          </li>
          <li className="nav-item">
            <a href="#" className="nav-link">
              <span className="icon">📑</span>
              Audit Trail
            </a>
          </li>
        </ul>

        <div className="sidebar-footer">
          <span>GMP Mode</span>
          <span className="pill-muted">Pilot • On-prem</span>
        </div>
      </aside>

      {/* MAIN AREA */}
      <main className="main">
        {/* TOP BAR */}
        <header className="top-bar">
          <div>
            <div className="page-tag">Stock Control • Live Pilot</div>
            <div className="page-title">
              {view === "dashboard" ? (
                <>
                  Inventory Command Centre{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                    / ES Specials
                  </span>
                </>
              ) : (
                <>
                  Materials Library{" "}
                  <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                    / ES Master Data
                  </span>
                </>
              )}
            </div>
            <div className="page-subtitle">
              {view === "dashboard"
                ? "See your materials, batch expiries and locations in one boujee, high-trust view."
                : "Maintain the single source of truth for ES material masters, codes and ES-criteria status."}
            </div>
          </div>
          <div className="top-bar-actions">
            <div className="chip">
              <span className="chip-dot" />
              Stock engine healthy
            </div>
            {view === "dashboard" ? (
              <>
                <button className="btn btn-ghost">🔍 Quick Find</button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setShowReceiptModal(true)}
                >
                  ✨ New Goods Receipt
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost">🧬 Code rules</button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setShowNewMaterialModal(true)}
                >
                  ➕ New Material
                </button>
              </>
            )}
          </div>
        </header>

        {/* CONTENT */}
        {view === "dashboard" && (
          <section className="content">
            <div className="grid-top">
              {/* LEFT CARD – metrics & alerts */}
              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Today’s Stock Posture</div>
                    <div className="card-subtitle">
                      Snapshot • Phase-1 Stock Control (demo)
                    </div>
                  </div>
                  <div className="card-actions">
                    <span className="pill">⏱ Auto-refresh 5 min</span>
                    <span className="pill pill-accent">
                      ⚡ Scan mode ready
                    </span>
                  </div>
                </div>

                {/* METRICS */}
                <div className="metrics-row">
                  <div className="metric-card accent-1">
                    <div className="metric-label">
                      Total live materials
                      <span className="metric-chip">
                        incl. APIs &amp; Excipients
                      </span>
                    </div>
                    <div className="metric-value">
                      {materials.length}{" "}
                      <span style={{ fontSize: "11px", color: "#facc15" }}>
                        SKUs
                      </span>
                    </div>
                    <div className="metric-trend">
                      ▲ +6 new in last 7 days
                    </div>
                    <div className="mini-spark">Σ</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">
                      Batches ≤ 30 days to expiry
                    </div>
                    <div className="metric-value">
                      23{" "}
                      <span style={{ fontSize: "11px", color: "#fecaca" }}>
                        batches
                      </span>
                    </div>
                    <div className="metric-trend danger">
                      ● Review with QA this week
                    </div>
                    <div className="mini-spark">30d</div>
                  </div>

                  <div className="metric-card accent-2">
                    <div className="metric-label">
                      Quarantine stock
                      <span className="metric-chip">OOS / Hold</span>
                    </div>
                    <div className="metric-value">
                      7{" "}
                      <span style={{ fontSize: "11px", color: "#e5e7eb" }}>
                        lots
                      </span>
                    </div>
                    <div className="metric-trend">
                      ▼ −2 released this week
                    </div>
                    <div className="mini-spark">Q</div>
                  </div>

                  <div className="metric-card">
                    <div className="metric-label">Book value on hand</div>
                    <div className="metric-value">
                      £426k{" "}
                      <span style={{ fontSize: "11px", color: "#a5b4fc" }}>
                        across all sites
                      </span>
                    </div>
                    <div className="metric-trend">
                      ▲ +£38k since month-start
                    </div>
                    <div className="mini-spark">£</div>
                  </div>
                </div>

                {/* LOWER GRID – alerts + locations (placeholder / static) */}
                <div className="grid-sub">
                  {/* Alerts */}
                  <div>
                    <div
                      className="card-title"
                      style={{ fontSize: "13px", marginBottom: 6 }}
                    >
                      Critical expiry &amp; low-stock alerts
                    </div>
                    <ul className="alert-list">
                      <li className="alert-item">
                        <div>
                          <div className="alert-name">
                            <span className="dot-danger" />
                            Allopurinol API
                          </div>
                          <div className="alert-meta">
                            MAT0003 • SMS Life Sciences
                          </div>
                        </div>
                        <div>
                          <div className="alert-meta">Expires in</div>
                          <strong>7 days</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="alert-meta">On hand</div>
                          <span className="alert-pill">
                            1.2 kg{" "}
                            <span style={{ color: "#fecaca" }}>Low</span>
                          </span>
                        </div>
                      </li>
                      <li className="alert-item">
                        <div>
                          <div className="alert-name">
                            <span className="dot-warning" />
                            Hydroxyzine 25 mg tabs
                          </div>
                          <div className="alert-meta">MAT0403 • Zentiva</div>
                        </div>
                        <div>
                          <div className="alert-meta">Used in</div>
                          <strong>ES174424</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="alert-meta">Remaining</div>
                          <span className="alert-pill">
                            244 tabs{" "}
                            <span style={{ color: "#bbf7d0" }}>OK</span>
                          </span>
                        </div>
                      </li>
                      <li className="alert-item">
                        <div>
                          <div className="alert-name">
                            <span className="dot-warning" />
                            Sodium Benzoate
                          </div>
                          <div className="alert-meta">
                            SB-ES-07 • Excipient
                          </div>
                        </div>
                        <div>
                          <div className="alert-meta">Next due</div>
                          <strong>15 Jan 27</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="alert-meta">QC Status</div>
                          <span className="alert-pill">Due in 2 days</span>
                        </div>
                      </li>
                    </ul>
                  </div>

                  {/* Locations */}
                  <div>
                    <div
                      className="card-title"
                      style={{ fontSize: "13px", marginBottom: 6 }}
                    >
                      Stock by location
                    </div>
                    <div className="chip-row">
                      <span className="chip-filter active">Main Store</span>
                      <span className="chip-filter">
                        Weigh &amp; Dispense
                      </span>
                      <span className="chip-filter">Quarantine</span>
                      <span className="chip-filter">Released Only</span>
                    </div>
                    <div className="location-grid">
                      <div className="location-card">
                        <div className="location-name">
                          ES-MS-01 • Main Store
                        </div>
                        <div className="location-meta">
                          <span>76 lots</span>
                          <span>£284k</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={
                              { "--value": "78%" } as React.CSSProperties
                            }
                          />
                        </div>
                      </div>
                      <div className="location-card">
                        <div className="location-name">
                          ES-WD-01 • Weigh &amp; Dispense
                        </div>
                        <div className="location-meta">
                          <span>19 lots</span>
                          <span>£42k</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={
                              { "--value": "48%" } as React.CSSProperties
                            }
                          />
                        </div>
                      </div>
                      <div className="location-card">
                        <div className="location-name">
                          ES-QC-01 • Quarantine
                        </div>
                        <div className="location-meta">
                          <span>7 lots</span>
                          <span>£18k</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={
                              { "--value": "64%" } as React.CSSProperties
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* RIGHT CARD – LIVE LOT BALANCES */}
              <section className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Live lot balances</div>
                    <div className="card-subtitle">
                      Backed by /lot-balances • FastAPI
                    </div>
                  </div>
                  <div className="card-actions">
                    <span className="pill">TAB = Tablet</span>
                  </div>
                </div>

                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Material</th>
                        <th>Lot</th>
                        <th>Qty</th>
                        <th>Expiry</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingLots && (
                        <tr>
                          <td colSpan={5}>Loading lot balances…</td>
                        </tr>
                      )}
                      {lotsError && !loadingLots && (
                        <tr>
                          <td colSpan={5} style={{ color: "#fecaca" }}>
                            {lotsError}
                          </td>
                        </tr>
                      )}
                      {!loadingLots &&
                        !lotsError &&
                        lotBalances.length === 0 && (
                          <tr>
                            <td colSpan={5}>No lots found yet.</td>
                          </tr>
                        )}
                      {!loadingLots &&
                        !lotsError &&
                        lotBalances.map((lot) => (
                          <tr
                            key={`${lot.material_code}-${lot.lot_number}`}
                          >
                            <td>
                              {lot.material_name}
                              <br />
                              <span className="alert-meta">
                                {lot.material_code}
                              </span>
                            </td>
                            <td>{lot.lot_number}</td>
                            <td>
                              {lot.balance_qty} {lot.uom_code}
                            </td>
                            <td>{formatDate(lot.expiry_date)}</td>
                            <td>
                              <span
                                className={
                                  lot.status === "RELEASED"
                                    ? "tag tag-success"
                                    : lot.status === "QUARANTINE"
                                    ? "tag tag-warning"
                                    : "tag tag-muted"
                                }
                              >
                                {lot.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
        )}

        {view === "materials" && (
          <section className="content">
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">ES Materials Library</div>
                  <div className="card-subtitle">
                    Master data for all raw materials, APIs and excipients used
                    in ES Specials.
                  </div>
                </div>
                <div className="card-actions">
                  <select
                    className="input"
                    style={{ width: 180, marginRight: 8 }}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="ALL">All categories</option>
                    {MATERIAL_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>

                  <select
                    className="input"
                    style={{ width: 160, marginRight: 8 }}
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="ALL">All types</option>
                    {MATERIAL_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>

                  <input
                    className="input"
                    style={{ width: 260 }}
                    placeholder="Search by code, name, supplier, manufacturer…"
                    value={materialsSearch}
                    onChange={(e) => setMaterialsSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Base UOM</th>
                      <th>Manufacturer</th>
                      <th>Supplier</th>
                      <th>ES Criteria</th>
                      <th>Status</th>
                      <th style={{ width: 80 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libraryFilteredMaterials.length === 0 && (
                      <tr>
                        <td colSpan={10}>No materials found.</td>
                      </tr>
                    )}
                    {libraryFilteredMaterials.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.material_code}</strong>
                        </td>
                        <td>{m.name}</td>
                        <td>{m.category_code}</td>
                        <td>{m.type_code}</td>
                        <td>{m.base_uom_code}</td>
                        <td>{m.manufacturer || "—"}</td>
                        <td>{m.supplier || "—"}</td>
                        <td>
                          <span
                            className={
                              m.complies_es_criteria
                                ? "tag tag-success"
                                : "tag tag-warning"
                            }
                          >
                            {m.complies_es_criteria ? "Complies" : "No"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              m.status === "ACTIVE"
                                ? "tag tag-success"
                                : m.status === "OBSOLETE"
                                ? "tag tag-warning"
                                : "tag tag-muted"
                            }
                          >
                            {m.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setEditingMaterial(m)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        )}
      </main>

      {/* MODALS */}
      <NewReceiptModal
        open={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        materials={materials}
        onReceiptPosted={loadLotBalances}
      />
      <IssueModal
        open={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        materials={materials}
        lotBalances={lotBalances}
        onIssuePosted={loadLotBalances}
      />
      <MaterialModal
        open={showNewMaterialModal}
        onClose={() => setShowNewMaterialModal(false)}
        mode="create"
        onSaved={handleMaterialSaved}
      />
      <MaterialModal
        open={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        mode="edit"
        initial={editingMaterial || undefined}
        onSaved={handleMaterialSaved}
      />
    </div>
  );
};

export default App;
