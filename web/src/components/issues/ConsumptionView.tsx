import React, { useMemo, useState } from "react";
import type { Issue } from "../../types";
import { formatDate } from "../../utils/format";

// Local date filter type just for this view
type DateFilter = "ALL" | "30" | "90" | "365" | "CUSTOM";
interface ConsumptionViewProps {
  issues: Issue[];
  loadingIssues: boolean;
  issuesError: string | null;
  onNewIssue: () => void;
}

const ConsumptionView: React.FC<ConsumptionViewProps> = ({
  issues,
  loadingIssues,
  issuesError,
  onNewIssue,
}) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");
  const [uomFilter, setUomFilter] = useState<string>("ALL");
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");
  const [manufacturerFilter, setManufacturerFilter] = useState<string>("ALL");

  const uniqueUoms = useMemo(
    () =>
      Array.from(
        new Set(issues.map((i) => i.uom_code).filter((x) => !!x))
      ).sort(),
    [issues]
  );

  const uniqueSuppliers = useMemo(
    () =>
      Array.from(
        new Set(
          issues
            .map((i) => i.supplier || "")
            .filter((x) => x && x.trim().length > 0)
        )
      ).sort(),
    [issues]
  );

  const uniqueManufacturers = useMemo(
    () =>
      Array.from(
        new Set(
          issues
            .map((i) => i.manufacturer || "")
            .filter((x) => x && x.trim().length > 0)
        )
      ).sort(),
    [issues]
  );

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return issues.filter((i) => {
      if (dateFilter !== "ALL") {
        const created = new Date(i.created_at);
        const diffMs = now.getTime() - created.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (dateFilter === "30" && diffDays > 30) return false;
        if (dateFilter === "90" && diffDays > 90) return false;
        if (dateFilter === "365" && diffDays > 365) return false;
      }

      if (uomFilter !== "ALL" && i.uom_code !== uomFilter) {
        return false;
      }

      if (supplierFilter !== "ALL" && i.supplier !== supplierFilter) {
        return false;
      }

      if (
        manufacturerFilter !== "ALL" &&
        i.manufacturer !== manufacturerFilter
      ) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        i.material_code,
        i.material_name,
        i.lot_number,
        i.uom_code,
        i.supplier ?? "",
        i.manufacturer ?? "",
        i.product_batch_no ?? "",
        i.comment ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [
    issues,
    search,
    dateFilter,
    uomFilter,
    supplierFilter,
    manufacturerFilter,
  ]);

  return (
    <section className="content">
      <header className="content-header">
        <div>
          <h1>Consumption / Issues</h1>
          <p className="content-subtitle">
            Track material consumption by lot, including Issue Date and Product
            Manufacture Date.
          </p>
        </div>
        <div className="content-actions">
          <button className="btn primary" onClick={onNewIssue}>
            + New Issue
          </button>
        </div>
      </header>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Issue History</h2>
            <p className="card-subtitle">
              Filter by date, UOM, supplier and manufacturer, or use the search
              box to find specific lots or materials.
            </p>
          </div>
          <div className="card-actions card-actions-wrap">
            <input
              className="input"
              placeholder="Search material / lot / supplier / manufacturer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="select"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            >
              <option value="ALL">All dates</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
            </select>

            <select
              className="select"
              value={uomFilter}
              onChange={(e) => setUomFilter(e.target.value)}
            >
              <option value="ALL">All UOMs</option>
              {uniqueUoms.map((uom) => (
                <option key={uom} value={uom}>
                  {uom}
                </option>
              ))}
            </select>

            <select
              className="select"
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
              className="select"
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
          </div>
        </div>

        <div className="card-body">
          {loadingIssues && (
            <div className="info-row">Loading consumption history…</div>
          )}
          {issuesError && !loadingIssues && (
            <div className="error-row">{issuesError}</div>
          )}
          {!loadingIssues && !issuesError && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Issue Date</th>
                    <th>Product Mfg Date</th>
                    <th>Material Code</th>
                    <th>Material Name</th>
                    <th>Lot No.</th>
                    <th>Expiry</th>
                    <th className="numeric">Qty</th>
                    <th>UOM</th>
                    <th>Supplier</th>
                    <th>Manufacturer</th>
                    <th>Ref / Comment</th>
                    <th>Created By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.length === 0 && (
                    <tr>
                      <td colSpan={12} className="empty-row">
                        No issues match your filters.
                      </td>
                    </tr>
                  )}

                  {filteredIssues.map((i) => (
                    <tr key={i.id}>
                      <td>{formatDate(i.created_at)}</td>
                      <td>{formatDate(i.product_manufacture_date)}</td>
                      <td>{i.material_code}</td>
                      <td>{i.material_name}</td>
                      <td>{i.lot_number}</td>
                      <td>{formatDate(i.expiry_date)}</td>
                      <td className="numeric">{i.qty}</td>
                      <td>{i.uom_code}</td>
                      <td>{i.supplier || "—"}</td>
                      <td>{i.manufacturer || "—"}</td>
                      <td>
                        {i.product_batch_no || i.comment
                          ? [i.product_batch_no, i.comment]
                              .filter(Boolean)
                              .join(" — ")
                          : "—"}
                      </td>
                      <td>{i.created_by}</td>
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

export default ConsumptionView;
