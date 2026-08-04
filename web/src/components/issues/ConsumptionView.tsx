import React, { useMemo, useState } from "react";
import type { Issue } from "../../types";
import { formatDate } from "../../utils/format";
import CsvExportModal from "../../components/modals/CsvExportModal";

type DateFilter = "ALL" | "30" | "90" | "365";
type ConsumptionTypeFilter =
  | "ALL"
  | "USAGE"
  | "WASTAGE"
  | "DESTRUCTION"
  | "R_AND_D"
  | "CANCELLED_BMR";

interface ConsumptionViewProps {
  issues: Issue[];
  loadingIssues: boolean;
  issuesError: string | null;
  onNewIssue: () => void;
  canEdit?: boolean;
  onEditIssue?: (i: Issue) => void;
}

type CsvExportParams = {
  fromDate: string | null;
  toDate: string | null;
  respectFilters: boolean;
};

const CONSUMPTION_TYPE_LABELS: Record<string, string> = {
  USAGE: "Usage (Batch manufacturing)",
  WASTAGE: "Wastage",
  DESTRUCTION: "Destruction",
  R_AND_D: "R&D usage",
  CANCELLED_BMR: "Cancelled BMR",
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatMoney = (value: unknown): string => {
  const number = asNumber(value);
  return number === null ? "—" : `£${number.toFixed(2)}`;
};

const formatUnitMoney = (value: unknown): string => {
  const number = asNumber(value);
  return number === null ? "—" : `£${number.toFixed(4)}`;
};

const formatBatchOutput = (issue: Issue): string => {
  const batchSize = asNumber(issue.total_batch_size);
  const units = asNumber(issue.number_of_units);
  const uom = issue.batch_size_uom?.trim();
  if (batchSize === null && units === null && !uom) return "—";

  const parts: string[] = [];
  if (batchSize !== null) {
    parts.push(
      `${batchSize.toLocaleString("en-GB", { maximumFractionDigits: 6 })}${
        uom ? ` ${uom}` : ""
      }`
    );
  }
  if (units !== null) {
    parts.push(
      `${units.toLocaleString("en-GB", { maximumFractionDigits: 0 })} ${
        units === 1 ? "unit" : "units"
      }`
    );
  }
  return parts.join(" • ") || "—";
};

const exportToCsv = (
  filename: string,
  rows: (string | number | null | undefined)[][]
) => {
  const escapeCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return "";
    const value = String(cell);
    return value.includes('"') || value.includes(",") || value.includes("\n")
      ? `"${value.replace(/"/g, '""')}"`
      : value;
  };

  const csv = `${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const ConsumptionView: React.FC<ConsumptionViewProps> = ({
  issues,
  loadingIssues,
  issuesError,
  canEdit = false,
  onEditIssue,
}) => {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");
  const [manufacturerFilter, setManufacturerFilter] = useState("ALL");
  const [customerFilter, setCustomerFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<ConsumptionTypeFilter>("ALL");
  const [dispositionFilter, setDispositionFilter] = useState("ALL");
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const uniqueManufacturers = useMemo(
    () =>
      Array.from(
        new Set(
          issues
            .map((issue) => issue.manufacturer || "")
            .filter((value) => value.trim().length > 0)
        )
      ).sort(),
    [issues]
  );

  const uniqueCustomers = useMemo(
    () =>
      Array.from(
        new Set(
          issues
            .map((issue) => issue.customer_name || "")
            .filter((value) => value.trim().length > 0)
        )
      ).sort(),
    [issues]
  );

  const uniqueTypes = useMemo(
    () =>
      Array.from(
        new Set(
          issues
            .map((issue) => issue.consumption_type || "USAGE")
            .filter((value) => value.trim().length > 0)
        )
      ).sort(),
    [issues]
  );

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = new Date();

    return issues.filter((issue) => {
      const type = (issue.consumption_type || "USAGE") as ConsumptionTypeFilter;

      if (dateFilter !== "ALL") {
        const ageDays =
          (now.getTime() - new Date(issue.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > Number(dateFilter)) return false;
      }
      if (manufacturerFilter !== "ALL" && issue.manufacturer !== manufacturerFilter) {
        return false;
      }
      if (customerFilter !== "ALL" && issue.customer_name !== customerFilter) {
        return false;
      }
      if (typeFilter !== "ALL" && type !== typeFilter) return false;
      if (
        dispositionFilter !== "ALL" &&
        (issue.batch_disposition || "COMPLIANT") !== dispositionFilter
      ) {
        return false;
      }
      if (!query) return true;

      return [
        issue.material_code,
        issue.material_name,
        issue.lot_number,
        issue.uom_code,
        issue.manufacturer,
        issue.customer_name,
        issue.es_product_code,
        issue.product_batch_no,
        issue.consumption_group_id,
        issue.total_batch_size,
        issue.batch_size_uom,
        issue.number_of_units,
        issue.comment,
        issue.consumption_type,
        issue.material_status_at_txn,
        issue.batch_disposition,
        issue.disposition_reason,
        issue.product_name_snapshot,
      ]
        .map((value) => value ?? "")
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    issues,
    search,
    dateFilter,
    manufacturerFilter,
    customerFilter,
    typeFilter,
    dispositionFilter,
  ]);

  const renderConsumptionType = (raw?: string | null): string =>
    raw ? CONSUMPTION_TYPE_LABELS[raw] ?? raw : "Usage";

  const handleExportConfirm = ({
    fromDate,
    toDate,
    respectFilters,
  }: CsvExportParams) => {
    const source = respectFilters ? filteredIssues : issues;
    const from = fromDate ? new Date(fromDate) : null;
    const toExclusive = toDate ? new Date(toDate) : null;
    if (toExclusive) toExclusive.setDate(toExclusive.getDate() + 1);

    const exportSource = source.filter((issue) => {
      const created = new Date(issue.created_at);
      if (from && created < from) return false;
      if (toExclusive && created >= toExclusive) return false;
      return true;
    });

    const header = [
      "Issue Date",
      "Product Mfg Date",
      "Type",
      "Batch Disposition",
      "Disposition Reason",
      "ES Product Code",
      "ES Batch / Ref",
      "Customer Name",
      "Total Batch Size",
      "Batch Size UOM",
      "Number of Units",
      "Consumption Group ID",
      "Material Code",
      "Material Name",
      "Lot No.",
      "Expiry",
      "Qty",
      "UOM",
      "Cost (£)",
      "Unit Cost (£/UOM)",
      "Manufacturer",
      "Status @ Use",
      "Comment",
      "Created By",
    ];

    const rows = exportSource.map((issue) => {
      const type = (issue.consumption_type || "USAGE") as ConsumptionTypeFilter;
      const batchRelevant =
        type === "USAGE" || type === "R_AND_D" || type === "CANCELLED_BMR";
      return [
        formatDate(issue.created_at),
        formatDate(issue.product_manufacture_date),
        renderConsumptionType(issue.consumption_type),
        issue.batch_disposition || "COMPLIANT",
        issue.disposition_reason || "—",
        batchRelevant ? issue.es_product_code || "—" : "N/A",
        batchRelevant ? issue.product_batch_no || "—" : "N/A",
        batchRelevant ? issue.customer_name || "—" : "N/A",
        batchRelevant ? issue.total_batch_size ?? "—" : "N/A",
        batchRelevant ? issue.batch_size_uom ?? "—" : "N/A",
        batchRelevant ? issue.number_of_units ?? "—" : "N/A",
        issue.consumption_group_id ?? "—",
        issue.material_code,
        issue.material_name,
        issue.lot_number,
        formatDate(issue.expiry_date),
        issue.is_non_stock_record ? "N/A" : issue.qty,
        issue.is_non_stock_record ? "N/A" : issue.uom_code,
        formatMoney(issue.total_value),
        formatUnitMoney(issue.unit_price),
        issue.manufacturer || "—",
        issue.material_status_at_txn || "—",
        issue.comment?.trim() || "—",
        issue.created_by,
      ];
    });

    exportToCsv("consumption_history.csv", [header, ...rows]);
    setExportModalOpen(false);
  };

  const showActions = Boolean(canEdit);
  const emptyColSpan = showActions ? 20 : 19;

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Issue History</div>
            <div className="card-subtitle">Input consumption history</div>
          </div>
          <div className="card-actions card-actions-wrap">
            <input
              className="input"
              style={{ minWidth: 280 }}
              placeholder="Search material / batch / customer / comment…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="input"
              style={{ width: 150 }}
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            >
              <option value="ALL">All dates</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
            </select>
            <select
              className="input"
              style={{ width: 175 }}
              value={dispositionFilter}
              onChange={(event) => setDispositionFilter(event.target.value)}
            >
              <option value="ALL">All dispositions</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              className="input"
              style={{ width: 190 }}
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as ConsumptionTypeFilter)
              }
            >
              <option value="ALL">All types</option>
              {uniqueTypes.map((type) => (
                <option key={type} value={type}>
                  {CONSUMPTION_TYPE_LABELS[type] ?? type}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 210 }}
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
            >
              <option value="ALL">All customers</option>
              {uniqueCustomers.map((customer) => (
                <option key={customer} value={customer}>
                  {customer}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 210 }}
              value={manufacturerFilter}
              onChange={(event) => setManufacturerFilter(event.target.value)}
            >
              <option value="ALL">All manufacturers</option>
              {uniqueManufacturers.map((manufacturer) => (
                <option key={manufacturer} value={manufacturer}>
                  {manufacturer}
                </option>
              ))}
            </select>
            <button className="btn" onClick={() => setExportModalOpen(true)}>
              Export CSV
            </button>
          </div>
        </div>

        {loadingIssues && <div className="info-row">Loading consumption history…</div>}
        {issuesError && !loadingIssues && <div className="error-row">{issuesError}</div>}

        {!loadingIssues && !issuesError && (
          <div className="table-wrapper" style={{ maxHeight: 480, overflowY: "auto" }}>
            <table className="table">
              <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#050816" }}>
                <tr>
                  <th>Issue Date</th>
                  <th>Product Mfg Date</th>
                  <th>Type</th>
                  <th>Disposition</th>
                  <th>ES Product</th>
                  <th>ES Batch / Ref</th>
                  <th>Customer</th>
                  <th>Batch Output</th>
                  <th>Material Code</th>
                  <th>Material Name</th>
                  <th>Lot No.</th>
                  <th>Expiry</th>
                  <th className="numeric">Qty</th>
                  <th>UOM</th>
                  <th className="numeric">Cost (£)</th>
                  <th>Manufacturer</th>
                  <th>Status @ use</th>
                  <th>Comment</th>
                  <th>Created By</th>
                  {showActions && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredIssues.length === 0 && (
                  <tr>
                    <td colSpan={emptyColSpan} className="empty-row">
                      No issues match your filters.
                    </td>
                  </tr>
                )}

                {filteredIssues.map((issue) => {
                  const type = (issue.consumption_type || "USAGE") as ConsumptionTypeFilter;
                  const batchRelevant =
                    type === "USAGE" || type === "R_AND_D" || type === "CANCELLED_BMR";
                  return (
                    <tr
                      key={issue.id}
                      className={
                        issue.batch_disposition === "REJECTED"
                          ? "batch-row-rejected"
                          : issue.batch_disposition === "CANCELLED"
                            ? "batch-row-cancelled"
                            : ""
                      }
                    >
                      <td>{formatDate(issue.created_at)}</td>
                      <td>{formatDate(issue.product_manufacture_date)}</td>
                      <td>{renderConsumptionType(issue.consumption_type)}</td>
                      <td title={issue.disposition_reason || ""}>
                        <span
                          className={`disposition-badge disposition-${(
                            issue.batch_disposition || "COMPLIANT"
                          ).toLowerCase()}`}
                        >
                          {issue.batch_disposition || "COMPLIANT"}
                        </span>
                      </td>
                      <td>{batchRelevant ? issue.es_product_code || "—" : "N/A"}</td>
                      <td>{batchRelevant ? issue.product_batch_no || "—" : "N/A"}</td>
                      <td>{batchRelevant ? issue.customer_name || "—" : "N/A"}</td>
                      <td>{batchRelevant ? formatBatchOutput(issue) : "N/A"}</td>
                      <td>{issue.material_code}</td>
                      <td>{issue.material_name}</td>
                      <td>{issue.lot_number}</td>
                      <td>{formatDate(issue.expiry_date)}</td>
                      <td className="numeric">
                        {issue.is_non_stock_record ? "N/A" : issue.qty}
                      </td>
                      <td>{issue.is_non_stock_record ? "N/A" : issue.uom_code}</td>
                      <td className="numeric">{formatMoney(issue.total_value)}</td>
                      <td>{issue.manufacturer || "—"}</td>
                      <td>{issue.material_status_at_txn || "—"}</td>
                      <td>{issue.comment?.trim() || "—"}</td>
                      <td>{issue.created_by}</td>
                      {showActions && (
                        <td>
                          {!issue.is_non_stock_record ? (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: "4px 10px", fontSize: 12, borderRadius: 999 }}
                              onClick={() => onEditIssue?.(issue)}
                            >
                              Edit
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <CsvExportModal
          open={exportModalOpen}
          title="Export Issue / Consumption History"
          helpText="Export stock issues and consumption history to CSV, including customer and controlled batch details."
          fromLabel="Issue date from (optional)"
          toLabel="Issue date to (optional)"
          defaultRespectFilters={true}
          onClose={() => setExportModalOpen(false)}
          onConfirm={handleExportConfirm}
        />
      </section>
    </section>
  );
};

export default ConsumptionView;
