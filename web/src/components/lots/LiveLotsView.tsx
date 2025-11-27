import React, { useMemo, useState } from "react";
import type { LotBalance } from "../../types";
import { formatDate } from "../../utils/format";

// Local filter type (not from types.ts)
type StatusFilter = "ALL" | "QUARANTINE" | "RELEASED" | "REJECTED" | "EXPIRED";

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

  const filteredLots = useMemo(() => {
    const q = search.trim().toLowerCase();

    return lotBalances.filter((lot) => {
      if (statusFilter !== "ALL" && lot.status !== statusFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        lot.material_code,
        lot.material_name,
        lot.lot_number,
        lot.uom_code,
        lot.status,
        lot.manufacturer ?? "",
        lot.supplier ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [lotBalances, search, statusFilter]);

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Live lot balances</h2>
            <p className="card-subtitle">
              Real-time view of all lots with current balance, manufacturer and
              supplier.
            </p>
          </div>
          <div className="card-actions">
            <input
              className="input"
              placeholder="Search material / lot / manufacturer / supplier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input"
              style={{ width: 180 }}
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
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Material code</th>
                    <th>Material name</th>
                    <th>Lot No.</th>
                    <th>Expiry</th>
                    <th>Manufacturer</th>
                    <th>Supplier</th>
                    <th className="numeric">Balance</th>
                    <th>UOM</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLots.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty-row">
                        No lots match your filters.
                      </td>
                    </tr>
                  )}
                  {filteredLots.map((lot) => (
                    <tr key={`${lot.material_code}-${lot.lot_number}`}>
                      <td>{lot.material_code}</td>
                      <td>{lot.material_name}</td>
                      <td>{lot.lot_number}</td>
                      <td>{formatDate(lot.expiry_date)}</td>
                      <td>{lot.manufacturer || "—"}</td>
                      <td>{lot.supplier || "—"}</td>
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
