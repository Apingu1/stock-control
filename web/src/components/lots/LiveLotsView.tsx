// src/components/lots/LiveLotsView.tsx

import React, { useMemo, useState } from "react";
import type { LotBalance } from "../../types";
import { formatDate } from "../../utils/format";

type LiveLotsViewProps = {
  lotBalances: LotBalance[];
  loadingLots: boolean;
  lotsError: string | null;
};

type StatusFilter = "ALL" | "RELEASED" | "QUARANTINE" | "OTHER";

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
      if (statusFilter !== "ALL") {
        if (statusFilter === "OTHER") {
          if (lot.status === "RELEASED" || lot.status === "QUARANTINE") {
            return false;
          }
        } else if (lot.status !== statusFilter) {
          return false;
        }
      }

      if (!q) return true;

      const fields = [
        lot.material_name,
        lot.material_code,
        lot.lot_number,
        lot.status,
      ];

      return fields.some((f) => f.toLowerCase().includes(q));
    });
  }, [lotBalances, search, statusFilter]);

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Live Lot Balances</div>
            <div className="card-subtitle">
              All current material lots with on-hand quantity and status.
            </div>
          </div>
          <div className="card-actions">
            <select
              className="input"
              style={{ width: 160 }}
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StatusFilter)
              }
            >
              <option value="ALL">All statuses</option>
              <option value="RELEASED">Released</option>
              <option value="QUARANTINE">Quarantine</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              className="input"
              style={{ width: 260 }}
              placeholder="Search by material, lot, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                filteredLots.length === 0 && (
                  <tr>
                    <td colSpan={5}>No lots match your filters.</td>
                  </tr>
                )}
              {!loadingLots &&
                !lotsError &&
                filteredLots.map((lot) => (
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
    </section>
  );
};

export default LiveLotsView;
