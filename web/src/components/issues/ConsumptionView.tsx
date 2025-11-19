// src/components/issues/ConsumptionView.tsx

import React, { useMemo, useState } from "react";
import type { Issue } from "../../types";
import { formatDate } from "../../utils/format";

type ConsumptionViewProps = {
  issues: Issue[];
  onNewIssue: () => void;
};

type DateFilter = "ALL" | "LAST_30";

const ConsumptionView: React.FC<ConsumptionViewProps> = ({
  issues,
  onNewIssue,
}) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const sorted = [...issues].sort((a, b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return db - da;
    });

    return sorted.filter((i) => {
      if (dateFilter === "LAST_30") {
        const t = new Date(i.created_at || 0).getTime();
        if (Number.isFinite(t) && now - t > thirtyDaysMs) return false;
      }

      if (!q) return true;

      const fields = [
        i.material_code,
        i.material_name || "",
        i.lot_number,
        i.product_batch_no || "",
        i.comment || "",
      ];

      return fields.some((f) => f.toLowerCase().includes(q));
    });
  }, [issues, search, dateFilter]);

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Issues &amp; Consumption</div>
            <div className="card-subtitle">
              Historic consumption of materials into ES product batches.
            </div>
          </div>
          <div className="card-actions">
            <select
              className="input"
              style={{ width: 160 }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            >
              <option value="ALL">All dates</option>
              <option value="LAST_30">Last 30 days</option>
            </select>
            <input
              className="input"
              style={{ width: 260 }}
              placeholder="Search by material, lot, ES batch, comment…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={onNewIssue}
            >
              ➕ New Consumption
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Lot</th>
                <th>Qty</th>
                <th>ES Batch</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.length === 0 && (
                <tr>
                  <td colSpan={6}>No consumption records found.</td>
                </tr>
              )}
              {filteredIssues.map((i) => (
                <tr key={i.id}>
                  <td>{formatDate(i.created_at || null)}</td>
                  <td>
                    <strong>{i.material_code}</strong>
                    <br />
                    <span className="alert-meta">
                      {i.material_name || "—"}
                    </span>
                  </td>
                  <td>{i.lot_number}</td>
                  <td>
                    {i.qty} {i.uom_code}
                  </td>
                  <td>{i.product_batch_no || "—"}</td>
                  <td>{i.comment || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default ConsumptionView;
