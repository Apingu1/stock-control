import React, { useMemo, useState } from "react";
import type { LotBalance } from "../../types";
import { formatDate } from "../../utils/format";
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_TYPE_OPTIONS,
} from "../../constants";

type StatusFilter = "ALL" | "QUARANTINE" | "RELEASED" | "REJECTED";

interface LiveLotsViewProps {
  lotBalances: LotBalance[];
  loadingLots: boolean;
  lotsError: string | null;
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

const LiveLotsView: React.FC<LiveLotsViewProps> = ({
  lotBalances,
  loadingLots,
  lotsError,
}) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const filteredLots = useMemo(() => {
    const q = search.trim().toLowerCase();

    return lotBalances.filter((lot) => {
      if (categoryFilter !== "ALL" && lot.category_code !== categoryFilter) {
        return false;
      }

      if (typeFilter !== "ALL" && lot.type_code !== typeFilter) {
        return false;
      }

      if (statusFilter !== "ALL" && lot.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        lot.material_code,
        lot.material_name,
        lot.category_code,
        lot.type_code,
        lot.lot_number,
        lot.uom_code,
        lot.status,
        lot.manufacturer ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [lotBalances, search, statusFilter, categoryFilter, typeFilter]);

  const handleExport = () => {
    const header = [
      "Material code",
      "Material name",
      "Category",
      "Type",
      "Lot No.",
      "Expiry",
      "Manufacturer",
      "Balance",
      "UOM",
      "Status",
    ];

    const rows = filteredLots.map((lot) => [
      lot.material_code,
      lot.material_name,
      lot.category_code,
      lot.type_code,
      lot.lot_number,
      lot.expiry_date ? formatDate(lot.expiry_date) : "",
      lot.manufacturer || "",
      lot.balance_qty,
      lot.uom_code,
      lot.status,
    ]);

    exportToCsv("live_lot_balances.csv", [header, ...rows]);
  };

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Live lot balances</div>
            <div className="card-subtitle">
              Real-time view of all lots with current balance, category, type
              and manufacturer.
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
              style={{ width: 260, marginRight: 8 }}
              placeholder="Search material / lot / manufacturer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="input"
              style={{ width: 160, marginRight: 8 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="ALL">All statuses</option>
              <option value="RELEASED">Released</option>
              <option value="QUARANTINE">Quarantine</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <button className="btn" onClick={handleExport}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="card-body">
          {loadingLots && <div className="info-row">Loading lot balances…</div>}
          {lotsError && !loadingLots && (
            <div className="error-row">{lotsError}</div>
          )}
          {!loadingLots && !lotsError && (
            <div
              className="table-wrapper"
              style={{ maxHeight: 480, overflowY: "auto" }}
            >
              <table className="table">
                <thead
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#050816",
                  }}
                >
                  <tr>
                    <th>Material code</th>
                    <th>Material name</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Lot No.</th>
                    <th>Expiry</th>
                    <th>Manufacturer</th>
                    <th className="numeric">Balance</th>
                    <th>UOM</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.length === 0 && (
                    <tr>
                      <td colSpan={10} className="empty-row">
                        No lots match your filters.
                      </td>
                    </tr>
                  )}
                  {filteredLots.map((lot) => (
                    <tr key={`${lot.material_code}-${lot.lot_number}`}>
                      <td>{lot.material_code}</td>
                      <td>{lot.material_name}</td>
                      <td>{lot.category_code}</td>
                      <td>{lot.type_code}</td>
                      <td>{lot.lot_number}</td>
                      <td>{formatDate(lot.expiry_date)}</td>
                      <td>{lot.manufacturer || "—"}</td>
                      <td className="numeric">{lot.balance_qty}</td>
                      <td>{lot.uom_code}</td>
                      <td>{lot.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </section>
  );
};

export default LiveLotsView;
