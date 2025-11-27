import React, { useMemo, useState } from "react";
import type { Receipt } from "../../types";
import { formatDate } from "../../utils/format";

type DateFilter = "ALL" | "30" | "90" | "365";

interface GoodsReceiptsViewProps {
  receipts: Receipt[];
  loadingReceipts: boolean;
  receiptsError: string | null;
  onNewReceipt: () => void;
}

const GoodsReceiptsView: React.FC<GoodsReceiptsViewProps> = ({
  receipts,
  loadingReceipts,
  receiptsError,
  onNewReceipt,
}) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");
  const [manufacturerFilter, setManufacturerFilter] = useState<string>("ALL");

  const uniqueSuppliers = useMemo(
    () =>
      Array.from(
        new Set(
          receipts
            .map((r) => r.supplier || "")
            .filter((x) => x && x.trim().length > 0)
        )
      ).sort(),
    [receipts]
  );

  const uniqueManufacturers = useMemo(
    () =>
      Array.from(
        new Set(
          receipts
            .map((r) => r.manufacturer || "")
            .filter((x) => x && x.trim().length > 0)
        )
      ).sort(),
    [receipts]
  );

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return receipts.filter((r) => {
      if (dateFilter !== "ALL") {
        const created = new Date(r.created_at);
        const diffMs = now.getTime() - created.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (dateFilter === "30" && diffDays > 30) return false;
        if (dateFilter === "90" && diffDays > 90) return false;
        if (dateFilter === "365" && diffDays > 365) return false;
      }

      if (supplierFilter !== "ALL" && r.supplier !== supplierFilter) {
        return false;
      }
      if (
        manufacturerFilter !== "ALL" &&
        r.manufacturer !== manufacturerFilter
      ) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        r.material_code,
        r.material_name,
        r.lot_number,
        r.uom_code,
        r.supplier ?? "",
        r.manufacturer ?? "",
        r.target_ref ?? "",
        r.comment ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [receipts, search, dateFilter, supplierFilter, manufacturerFilter]);

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Goods Receipts</div>
            <div className="card-subtitle">
              Log and review incoming goods. The Goods Receipt Date is the
              actual receipt date from the GRN, not just the record creation
              time.
            </div>
          </div>
          <div className="card-actions card-actions-wrap">
            <input
              className="input"
              style={{ minWidth: 260 }}
              placeholder="Search material / lot / supplier / manufacturer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="input"
              style={{ width: 150 }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            >
              <option value="ALL">All dates</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
            </select>

            <select
              className="input"
              style={{ width: 180 }}
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
            >
              <option value="ALL">All suppliers</option>
              {uniqueSuppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              className="input"
              style={{ width: 210 }}
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
            >
              <option value="ALL">All manufacturers</option>
              {uniqueManufacturers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <button className="btn primary" onClick={onNewReceipt}>
              + New Goods Receipt
            </button>
          </div>
        </div>

        {loadingReceipts && (
          <div className="info-row">Loading goods receipts…</div>
        )}
        {receiptsError && !loadingReceipts && (
          <div className="error-row">{receiptsError}</div>
        )}
        {!loadingReceipts && !receiptsError && (
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
                  <th>Goods Receipt Date</th>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>Lot No.</th>
                  <th>Expiry</th>
                  <th className="numeric">Qty</th>
                  <th>UOM</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                  <th>Supplier</th>
                  <th>Manufacturer</th>
                  <th>ES Criteria</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.length === 0 && (
                  <tr>
                    <td colSpan={13} className="empty-row">
                      No receipts match your filters.
                    </td>
                  </tr>
                )}

                {filteredReceipts.map((r) => {
                  let esLabel = "—";
                  let esClass = "tag tag-muted";

                  if (r.complies_es_criteria === true) {
                    esLabel = "Complies";
                    esClass = "tag tag-success";
                  } else if (r.complies_es_criteria === false) {
                    esLabel = "No";
                    esClass = "tag tag-warning";
                  }

                  return (
                    <tr key={r.id}>
                      <td>{formatDate(r.created_at)}</td>
                      <td>{r.material_code}</td>
                      <td>{r.material_name}</td>
                      <td>{r.lot_number}</td>
                      <td>{formatDate(r.expiry_date)}</td>
                      <td className="numeric">{r.qty}</td>
                      <td>{r.uom_code}</td>
                      <td className="numeric">
                        {r.unit_price != null ? r.unit_price.toFixed(2) : "—"}
                      </td>
                      <td className="numeric">
                        {r.total_value != null ? r.total_value.toFixed(2) : "—"}
                      </td>
                      <td>{r.supplier || "—"}</td>
                      <td>{r.manufacturer || "—"}</td>
                      <td>
                        <span className={esClass}>{esLabel}</span>
                      </td>
                      <td>{r.created_by}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
};

export default GoodsReceiptsView;
