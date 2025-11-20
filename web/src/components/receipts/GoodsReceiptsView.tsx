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
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return db - da; // newest first
    });

    return sorted.filter((r) => {
      if (dateFilter === "LAST_30") {
        const t = new Date(r.created_at).getTime();
        if (Number.isFinite(t) && now - t > thirtyDaysMs) return false;
      }

      if (!q) return true;

      const fields = [
        r.material_code,
        r.material_name || "",
        r.lot_number,
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
              Historic receipts into ES stock, newest first.
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
              placeholder="Search by material, lot, supplier, manufacturer…"
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
                <th>Receipt date</th>
                <th>Material code</th>
                <th>Material name</th>
                <th>Lot</th>
                <th>Expiry</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total price</th>
                <th>Supplier</th>
                <th>Manufacturer</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.length === 0 && (
                <tr>
                  <td colSpan={11}>No goods receipts found.</td>
                </tr>
              )}
              {filteredReceipts.map((r) => {
                const total =
                  r.total_value != null
                    ? r.total_value
                    : r.unit_price != null
                    ? r.unit_price * r.qty
                    : null;

                return (
                  <tr key={r.id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.material_code}</td>
                    <td>{r.material_name}</td>
                    <td>{r.lot_number}</td>
                    <td>{formatDate(r.expiry_date)}</td>
                    <td>
                      {r.qty} {r.uom_code}
                    </td>
                    <td>
                      {r.unit_price != null ? `£${r.unit_price.toFixed(4)}` : "—"}
                    </td>
                    <td>
                      {total != null ? `£${total.toFixed(2)}` : "—"}
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
