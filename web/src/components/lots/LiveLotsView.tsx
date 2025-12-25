import React, { useMemo, useState } from "react";
import type { LotBalance } from "../../types";
import { formatDate } from "../../utils/format";
import LotStatusModal from "../modals/LotStatusModal";
import CsvExportModal from "../modals/CsvExportModal";
import { MATERIAL_CATEGORY_OPTIONS, MATERIAL_TYPE_OPTIONS } from "../../constants";

type DateFilter = "ALL" | "30" | "90" | "365";

type CsvExportParams = {
  fromDate: string | null;
  toDate: string | null;
  respectFilters: boolean;
};

function normalizeStatus(s: string | null | undefined) {
  return (s || "").trim().toUpperCase();
}

function formatStatusLabel(s: string) {
  if (!s) return "—";
  if (s === "AVAILABLE") return "Available";
  if (s === "QUARANTINE") return "Quarantine";
  if (s === "REJECTED") return "Rejected";
  return s;
}

function buildStatusTooltip(lot: LotBalance) {
  const parts: string[] = [];
  if (lot.last_status_reason) parts.push(`Reason: ${lot.last_status_reason}`);
  if (lot.last_status_changed_at) parts.push(`Changed: ${lot.last_status_changed_at}`);
  return parts.join("\n") || "—";
}

const exportToCsv = (filename: string, rows: (string | number | null | undefined)[][]) => {
  const escapeCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return "";
    let s = String(cell);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const csvContent =
    rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const LiveLotsView: React.FC<{
  lotBalances: LotBalance[];
  loadingLots: boolean;
  lotsError: string | null;
  onLotStatusChanged?: () => void;
  canChangeStatus?: boolean; // NEW (optional)
}> = ({ lotBalances, loadingLots, lotsError, onLotStatusChanged, canChangeStatus = true }) => {
  const [materialsSearch, setMaterialsSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<LotBalance | null>(null);

  const [exportModalOpen, setExportModalOpen] = useState(false);

  // ✅ NEW: Total available per material (AVAILABLE only)
  const totalAvailableByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lotBalances) {
      const st = normalizeStatus(l.status);
      if (st !== "AVAILABLE") continue;
      const key = l.material_code;
      map.set(key, (map.get(key) || 0) + (Number(l.balance_qty) || 0));
    }
    return map;
  }, [lotBalances]);

  const uniqueStatuses = useMemo(() => {
    return Array.from(
      new Set(lotBalances.map((l) => normalizeStatus(l.status)).filter((x) => x))
    ).sort();
  }, [lotBalances]);

  const filteredLots = useMemo(() => {
    const q = materialsSearch.trim().toLowerCase();
    const now = new Date();

    return lotBalances.filter((lot) => {
      if (categoryFilter !== "ALL" && (lot.category_code || "") !== categoryFilter) return false;
      if (typeFilter !== "ALL" && (lot.type_code || "") !== typeFilter) return false;

      const st = normalizeStatus(lot.status);
      if (statusFilter !== "ALL" && st !== statusFilter) return false;

      if (dateFilter !== "ALL") {
        // practical “expiring within” filter
        if (lot.expiry_date) {
          const dt = new Date(lot.expiry_date);
          const diffDays = (dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          if (dateFilter === "30" && diffDays > 30) return false;
          if (dateFilter === "90" && diffDays > 90) return false;
          if (dateFilter === "365" && diffDays > 365) return false;
        }
      }

      if (!q) return true;

      const haystack = [
        lot.material_code,
        lot.material_name,
        lot.category_code || "",
        lot.type_code || "",
        lot.lot_number,
        lot.manufacturer || "",
        lot.supplier || "",
        lot.status,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [lotBalances, materialsSearch, categoryFilter, typeFilter, statusFilter, dateFilter]);

  const handleExportConfirm = ({ fromDate, toDate, respectFilters }: CsvExportParams) => {
    const base = respectFilters ? filteredLots : lotBalances;

    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    let toEnd: Date | null = null;
    if (to) {
      toEnd = new Date(to);
      toEnd.setDate(toEnd.getDate() + 1);
    }

    const exportRowsSource = base.filter((l) => {
      if (!from && !toEnd) return true;
      if (!l.expiry_date) return true; // keep rows w/o expiry
      const dt = new Date(l.expiry_date);
      if (from && dt < from) return false;
      if (toEnd && dt >= toEnd) return false;
      return true;
    });

    const header = [
      "Material Code",
      "Material Name",
      "Category",
      "Type",
      "Lot No",
      "Expiry",
      "Manufacturer",
      "Balance",
      "Total Available (All lots)",
      "UOM",
      "Status",
      "Last Status Reason",
      "Last Status Changed",
    ];

    const rows = exportRowsSource.map((l) => [
      l.material_code,
      l.material_name,
      l.category_code ?? "",
      l.type_code ?? "",
      l.lot_number,
      l.expiry_date ?? "",
      l.manufacturer ?? "",
      l.balance_qty,
      totalAvailableByMaterial.get(l.material_code) ?? 0,
      l.uom_code,
      l.status,
      l.last_status_reason ?? "",
      l.last_status_changed_at ?? "",
    ]);

    exportToCsv("live_lots.csv", [header, ...rows]);
    setExportModalOpen(false);
  };

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Live Lots</div>
            <div className="card-subtitle">
              On-hand balances by material + lot segment (split-lot safe).
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

            <select
              className="input"
              style={{ width: 160, marginRight: 8 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All statuses</option>
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              className="input"
              style={{ width: 140, marginRight: 8 }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            >
              <option value="ALL">All</option>
              <option value="30">Next 30d</option>
              <option value="90">Next 90d</option>
              <option value="365">Next 365d</option>
            </select>

            <input
              className="input"
              style={{ width: 260, marginRight: 8 }}
              placeholder="Search by code, name, lot, manufacturer…"
              value={materialsSearch}
              onChange={(e) => setMaterialsSearch(e.target.value)}
            />

            <button className="btn" onClick={() => setExportModalOpen(true)}>
              Export CSV
            </button>
          </div>
        </div>

        {loadingLots && <div className="info-row">Loading lot balances…</div>}
        {lotsError && !loadingLots && <div className="error-row">{lotsError}</div>}

        {!loadingLots && !lotsError && (
          <div className="table-wrapper" style={{ maxHeight: 480, overflowY: "auto" }}>
            <table className="table">
              <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#050816" }}>
                <tr>
                  <th>Material code</th>
                  <th>Material name</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Lot No.</th>
                  <th>Expiry</th>
                  <th>Manufacturer</th>
                  <th className="numeric">Balance</th>
                  <th className="numeric">Total available</th>
                  <th>UOM</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredLots.length === 0 && (
                  <tr>
                    <td colSpan={12} className="empty-row">
                      No lots match your filters.
                    </td>
                  </tr>
                )}

                {filteredLots.map((lot) => {
                  const st = normalizeStatus(lot.status);
                  const statusLabel = formatStatusLabel(st);

                  let tagClass = "tag tag-muted";
                  if (st === "AVAILABLE") tagClass = "tag tag-success";
                  if (st === "QUARANTINE") tagClass = "tag tag-warning";

                  const totalAvail = totalAvailableByMaterial.get(lot.material_code) ?? 0;

                  return (
                    <tr key={lot.material_lot_id}>
                      <td>{lot.material_code}</td>
                      <td>{lot.material_name}</td>
                      <td>{lot.category_code}</td>
                      <td>{lot.type_code}</td>
                      <td>{lot.lot_number}</td>
                      <td>{formatDate(lot.expiry_date)}</td>
                      <td>{lot.manufacturer || "—"}</td>
                      <td className="numeric">{lot.balance_qty}</td>
                      <td className="numeric">{totalAvail}</td>
                      <td>{lot.uom_code}</td>
                      <td>
                        <span className={tagClass} title={buildStatusTooltip(lot)}>
                          {statusLabel}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 12, borderRadius: 999 }}
                          disabled={!canChangeStatus}
                          title={!canChangeStatus ? "Requires SENIOR role" : ""}
                          onClick={() => {
                            setSelectedLot(lot);
                            setStatusModalOpen(true);
                          }}
                        >
                          Change
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <LotStatusModal
          open={statusModalOpen}
          lot={selectedLot}
          onClose={() => {
            setStatusModalOpen(false);
            setSelectedLot(null);
          }}
          onStatusChanged={() => {
            onLotStatusChanged?.();
          }}
        />

        <CsvExportModal
          open={exportModalOpen}
          title="Export Live Lots"
          helpText="Export live lot balances to CSV. Optionally limit by expiry date range and respect current filters."
          fromLabel="Expiry date from (optional)"
          toLabel="Expiry date to (optional)"
          defaultRespectFilters={true}
          onClose={() => setExportModalOpen(false)}
          onConfirm={handleExportConfirm}
        />
      </section>
    </section>
  );
};

export default LiveLotsView;
