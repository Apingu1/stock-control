import React, { useMemo, useState } from "react";
import type { Issue } from "../../types";
import { formatDate } from "../../utils/format";

type DateFilter = "ALL" | "30" | "90" | "365";
type ConsumptionTypeFilter =
  | "ALL"
  | "USAGE"
  | "WASTAGE"
  | "DESTRUCTION"
  | "R_AND_D";

interface ConsumptionViewProps {
  issues: Issue[];
  loadingIssues: boolean;
  issuesError: string | null;
  onNewIssue: () => void;
}

const CONSUMPTION_TYPE_LABELS: Record<string, string> = {
  USAGE: "Usage (Batch manufacturing)",
  WASTAGE: "Wastage",
  DESTRUCTION: "Destruction",
  R_AND_D: "R&D usage",
};

const ConsumptionView: React.FC<ConsumptionViewProps> = ({
  issues,
  loadingIssues,
  issuesError,
}) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");
  const [manufacturerFilter, setManufacturerFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<ConsumptionTypeFilter>("ALL");

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

  const uniqueTypes = useMemo(
    () =>
      Array.from(
        new Set(
          issues
            .map((i) => (i.consumption_type || "USAGE") as string)
            .filter((x) => x && x.trim().length > 0)
        )
      ).sort(),
    [issues]
  );

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();

    return issues.filter((i) => {
      const ct = (i.consumption_type || "USAGE") as ConsumptionTypeFilter;

      if (dateFilter !== "ALL") {
        const created = new Date(i.created_at);
        const diffMs = now.getTime() - created.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (dateFilter === "30" && diffDays > 30) return false;
        if (dateFilter === "90" && diffDays > 90) return false;
        if (dateFilter === "365" && diffDays > 365) return false;
      }

      if (manufacturerFilter !== "ALL" && i.manufacturer !== manufacturerFilter) {
        return false;
      }

      if (typeFilter !== "ALL" && ct !== typeFilter) {
        return false;
      }

      if (!q) return true;

      const haystack = [
        i.material_code,
        i.material_name,
        i.lot_number,
        i.uom_code,
        i.manufacturer ?? "",
        i.product_batch_no ?? "",
        i.comment ?? "",
        i.consumption_type ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [issues, search, dateFilter, manufacturerFilter, typeFilter]);

  const renderConsumptionType = (raw?: string | null): string =>
    raw ? CONSUMPTION_TYPE_LABELS[raw] ?? raw : "Usage";

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Issue History</div>
            <div className="card-subtitle">
              Filter by date, consumption type or manufacturer, or search by
              material, lot or ES batch.
            </div>
          </div>
          <div className="card-actions card-actions-wrap">
            <input
              className="input"
              style={{ minWidth: 260 }}
              placeholder="Search material / lot / ES batch / comment…"
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
              style={{ width: 190 }}
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as ConsumptionTypeFilter)
              }
            >
              <option value="ALL">All types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {CONSUMPTION_TYPE_LABELS[t] ?? t}
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
          </div>
        </div>

        {loadingIssues && (
          <div className="info-row">Loading consumption history…</div>
        )}
        {issuesError && !loadingIssues && (
          <div className="error-row">{issuesError}</div>
        )}
        {!loadingIssues && !issuesError && (
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
                  <th>Issue Date</th>
                  <th>Product Mfg Date</th>
                  <th>Type</th>
                  <th>ES Batch / Ref</th>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>Lot No.</th>
                  <th>Expiry</th>
                  <th className="numeric">Qty</th>
                  <th>UOM</th>
                  <th>Manufacturer</th>
                  <th>Comment</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {filteredIssues.length === 0 && (
                  <tr>
                    <td colSpan={13} className="empty-row">
                      No issues match your filters.
                    </td>
                  </tr>
                )}

                {filteredIssues.map((i) => {
                  const ct = (i.consumption_type || "USAGE") as ConsumptionTypeFilter;
                  const isBatchRelevant =
                    ct === "USAGE" || ct === "R_AND_D";

                  const esRef = isBatchRelevant
                    ? i.product_batch_no || "—"
                    : "N/A";

                  return (
                    <tr key={i.id}>
                      <td>{formatDate(i.created_at)}</td>
                      <td>{formatDate(i.product_manufacture_date)}</td>
                      <td>{renderConsumptionType(i.consumption_type)}</td>
                      <td>{esRef}</td>
                      <td>{i.material_code}</td>
                      <td>{i.material_name}</td>
                      <td>{i.lot_number}</td>
                      <td>{formatDate(i.expiry_date)}</td>
                      <td className="numeric">{i.qty}</td>
                      <td>{i.uom_code}</td>
                      <td>{i.manufacturer || "—"}</td>
                      <td>
                        {i.comment && i.comment.trim().length > 0
                          ? i.comment
                          : "—"}
                      </td>
                      <td>{i.created_by}</td>
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

export default ConsumptionView;
