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
    throw new Error(`HTTP ${res.status}: ${text}`);
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

// ---- Main App ---------------------------------------------------------------

const App: React.FC = () => {
  const [lotBalances, setLotBalances] = useState<LotBalance[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState<string | null>(null);

  const [showReceiptModal, setShowReceiptModal] = useState(false);

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
            <a href="#" className="nav-link active">
              <span className="icon">📊</span>
              Dashboard
              <span className="badge">Today</span>
            </a>
          </li>
          <li className="nav-item">
            <a href="#" className="nav-link">
              <span className="icon">🧪</span>
              Materials Library
            </a>
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
            <a href="#" className="nav-link">
              <span className="icon">🚚</span>
              Issues &amp; Consumption
            </a>
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
              Inventory Command Centre{" "}
              <span style={{ fontSize: "13px", color: "#a5b4fc" }}>
                / ES Specials
              </span>
            </div>
            <div className="page-subtitle">
              See your materials, batch expiries and locations in one boujee,
              high-trust view.
            </div>
          </div>
          <div className="top-bar-actions">
            <div className="chip">
              <span className="chip-dot" />
              Stock engine healthy
            </div>
            <button className="btn btn-ghost">🔍 Quick Find</button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setShowReceiptModal(true)}
            >
              ✨ New Goods Receipt
            </button>
            <div className="avatar-pill">
              <div className="avatar-img">AQ</div>
              <div className="avatar-meta">
                <div className="avatar-name">Apingu</div>
                <div className="avatar-role">Head of Quality</div>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT GRID */}
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
                  <span className="pill pill-accent">⚡ Scan mode ready</span>
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
                    {lotBalances.length > 0 ? 1 : 0}{" "}
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
                      <div className="location-name">ES-MS-01 • Main Store</div>
                      <div className="location-meta">
                        <span>76 lots</span>
                        <span>£284k</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ "--value": "78%" } as React.CSSProperties}
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
                          style={{ "--value": "48%" } as React.CSSProperties}
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
                          style={{ "--value": "64%" } as React.CSSProperties}
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
                    {!loadingLots && !lotsError && lotBalances.length === 0 && (
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
      </main>

      <NewReceiptModal
        open={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        materials={materials}
        onReceiptPosted={loadLotBalances}
      />
    </div>
  );
};

export default App;
