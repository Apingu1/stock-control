// src/components/receipts/GoodsReceiptsView.tsx

import React, { useMemo, useState } from "react";
import type { Receipt } from "../../types";
import { formatDate } from "../../utils/format";

type GoodsReceiptsViewProps = {
  receipts: Receipt[];
  onNewReceipt: () => void;
};

type DateFilter = "ALL" | "LAST_30";

const GoodsReceiptsView: React.FC<GoodsReceiptsViewProps> = ({
  receipts,
  onNewReceipt,
}) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const sorted = [...receipts].sort((a, b) => {
      const da = new Date(a.receipt_date || a.created_at || 0).getTime();
      const db = new Date(b.receipt_date || b.created_at || 0).getTime();
      return db - da; // descending
    });

    return sorted.filter((r) => {
      // date filter
      if (dateFilter === "LAST_30") {
        const t = new Date(r.receipt_date || r.created_at || 0).getTime();
        if (Number.isFinite(t) && now - t > thirtyDaysMs) return false;
      }

      if (!q) return true;

      const fields = [
        r.material_code,
        r.material_name || "",
        r.lot_number || "",
        r.supplier || "",
        r.manufacturer || "",
        r.comment || "",
      ];

      return fields.some((f) => f.toLowerCase().includes(q));
    });
  }, [receipts, search, dateFilter]);

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Goods Receipts</div>
            <div className="card-subtitle">
              Historic purchases and receipts into ES stock, newest first.
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
              placeholder="Search by material, lot, supplier, comment…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={onNewReceipt}
            >
              ➕ New Goods Receipt
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
                <th>Unit price</th>
                <th>Supplier</th>
                <th>Manufacturer</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={8}>No goods receipts found.</td>
                </tr>
              )}
              {filteredReceipts.map((r) => {
                const dateStr = formatDate(
                  r.receipt_date || r.created_at || null
                );
                return (
                  <tr key={r.id}>
                    <td>{dateStr}</td>
                    <td>
                      <strong>{r.material_code}</strong>
                      <br />
                      <span className="alert-meta">
                        {r.material_name || "—"}
                      </span>
                    </td>
                    <td>{r.lot_number || "—"}</td>
                    <td>
                      {r.qty} {r.uom_code}
                    </td>
                    <td>
                      {r.unit_price != null ? `£${r.unit_price.toFixed(4)}` : "—"}
                    </td>
                    <td>{r.supplier || "—"}</td>
                    <td>{r.manufacturer || "—"}</td>
                    <td>{r.comment || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default GoodsReceiptsView;
