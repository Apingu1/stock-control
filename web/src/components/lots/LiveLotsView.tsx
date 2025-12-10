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
      // Category filter
      if (categoryFilter !== "ALL" && lot.category_code !== categoryFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== "ALL" && lot.type_code !== typeFilter) {
        return false;
      }

      // Status filter
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
            {/* Category filter – same look as Materials Library */}
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

            {/* Type filter – same look as Materials Library */}
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

            {/* Search */}
            <input
              className="input"
              style={{ width: 260, marginRight: 8 }}
              placeholder="Search material / lot / manufacturer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {/* Status filter */}
            <select
              className="input"
              style={{ width: 160 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="ALL">All statuses</option>
              <option value="RELEASED">Released</option>
              <option value="QUARANTINE">Quarantine</option>
              <option value="REJECTED">Rejected</option>
            </select>
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
