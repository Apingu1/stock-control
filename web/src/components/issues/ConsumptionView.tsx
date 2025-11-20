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
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return db - da;
    });

    return sorted.filter((i) => {
      if (dateFilter === "LAST_30") {
        const t = new Date(i.created_at).getTime();
        if (Number.isFinite(t) && now - t > thirtyDaysMs) return false;
      }

      if (!q) return true;

      const fields = [
        i.material_code,
        i.material_name || "",
        i.lot_number,
        i.product_batch_no || "",
        i.manufacturer || "",
        i.supplier || "",
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
              placeholder="Search by material, lot, ES batch, manufacturer…"
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
                <th>Date (ES manufacture)</th>
                <th>Material code</th>
                <th>Material name</th>
                <th>Lot</th>
                <th>Lot expiry</th>
                <th>Qty</th>
                <th>ES Batch</th>
                <th>Manufacturer</th>
                <th>Supplier</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.length === 0 && (
                <tr>
                  <td colSpan={10}>No consumption records found.</td>
                </tr>
              )}
              {filteredIssues.map((i) => (
                <tr key={i.id}>
                  {/* ⭐ Use ES manufacture date if present, else fall back to created_at */}
                  <td>
                    {formatDate(
                      i.product_manufacture_date || i.created_at
                    )}
                  </td>
                  <td>{i.material_code}</td>
                  <td>{i.material_name}</td>
                  <td>{i.lot_number}</td>
                  <td>{formatDate(i.expiry_date)}</td>
                  <td>
                    {i.qty} {i.uom_code}
                  </td>
                  <td>{i.product_batch_no}</td>
                  <td>{i.manufacturer || "—"}</td>
                  <td>{i.supplier || "—"}</td>
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
