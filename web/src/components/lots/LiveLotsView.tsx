import { useMemo, useState } from "react";
import type { LotBalance } from "../../types";
import { formatDate } from "../../utils/format";
import { MATERIAL_CATEGORY_OPTIONS, MATERIAL_TYPE_OPTIONS } from "../../constants";
import LotStatusModal from "../modals/LotStatusModal";

type StatusFilter = "ALL" | "AVAILABLE" | "QUARANTINE" | "REJECTED";

interface LiveLotsViewProps {
  lotBalances: LotBalance[];
  loadingLots: boolean;
  lotsError: string | null;
  onLotStatusChanged?: () => void;
}

const exportToCsv = (
  filename: string,
  rows: (string | number | null | undefined)[][]
) => {
  const escapeCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return "";
    let s = String(cell);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const csvContent =
    rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const normalizeStatus = (s: string | null | undefined) => {
  const up = (s || "").toUpperCase().trim();
  if (up === "RELEASED") return "AVAILABLE"; // legacy compatibility
  return up || "UNKNOWN";
};

const formatStatusLabel = (s: string | null | undefined) => {
  const st = normalizeStatus(s);
  if (st === "AVAILABLE") return "Available";
  if (st === "QUARANTINE") return "Quarantine";
  if (st === "REJECTED") return "Rejected";
  return st;
};

const LiveLotsView: React.FC<LiveLotsViewProps> = ({
  lotBalances,
  loadingLots,
  lotsError,
  onLotStatusChanged,
}) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<LotBalance | null>(null);

  const filteredLots = useMemo(() => {
    const q = search.trim().toLowerCase();

    return lotBalances.filter((lot) => {
      if (categoryFilter !== "ALL" && lot.category_code !== categoryFilter) return false;
      if (typeFilter !== "ALL" && lot.type_code !== typeFilter) return false;

      const st = normalizeStatus(lot.status);
      if (statusFilter !== "ALL" && st !== statusFilter) return false;

      if (!q) return true;

      const haystack = [
        lot.material_code,
        lot.material_name,
        lot.category_code,
        lot.type_code,
        lot.lot_number,
        lot.uom_code,
        st,
        lot.manufacturer ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [lotBalances, search, statusFilter, categoryFilter, typeFilter]);

  const handleExport = () => {
    const header = [
      "Material code",
      "Material name",
      "Category",
      "Type",
      "Lot No.",
      "Expiry",
      "Manufacturer",
      "Balance",
      "UOM",
      "Status",
    ];

    const rows = filteredLots.map((lot) => [
      lot.material_code,
      lot.material_name,
      lot.category_code,
      lot.type_code,
      lot.lot_number,
      lot.expiry_date ? formatDate(lot.expiry_date) : "",
      lot.manufacturer || "",
      lot.balance_qty,
      lot.uom_code,
      normalizeStatus(lot.status),
    ]);

    exportToCsv("live_lot_balances.csv", [header, ...rows]);
  };

  const buildStatusTooltip = (lot: LotBalance): string => {
    const reason = lot.last_status_reason ?? undefined;
    const changedAt = lot.last_status_changed_at ?? undefined;

    if (!reason && !changedAt) return "No recorded status changes yet.";

    const dt = changedAt
      ? new Date(changedAt).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Unknown time";

    return `Last change: ${dt}\nReason: ${reason || "—"}`;
  };

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Live lot balances</div>
            <div className="card-subtitle">
              Real-time view of all lots with current balance, category, type and manufacturer.
            </div>
          </div>

          <div className="card-actions">
            <select
              className="input"
              style={{ width: 180, marginRight: 8 }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All categories</option>
              {MATERIAL_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <select
              className="input"
              style={{ width: 160, marginRight: 8 }}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All types</option>
              {MATERIAL_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <input
              className="input"
              style={{ width: 260, marginRight: 8 }}
              placeholder="Search material / lot / manufacturer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="input"
              style={{ width: 160, marginRight: 8 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="ALL">All statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="QUARANTINE">Quarantine</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <button className="btn" onClick={handleExport}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="card-body">
          {loadingLots && <div className="info-row">Loading lot balances…</div>}
          {lotsError && !loadingLots && <div className="error-row">{lotsError}</div>}

          {!loadingLots && !lotsError && (
            <div className="table-wrapper" style={{ maxHeight: 480, overflowY: "auto" }}>
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
                    <th>Material code</th>
                    <th>Material name</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Lot No.</th>
                    <th>Expiry</th>
                    <th>Manufacturer</th>
                    <th className="numeric">Balance</th>
                    <th>UOM</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLots.length === 0 && (
                    <tr>
                      <td colSpan={11} className="empty-row">
                        No lots match your filters.
                      </td>
                    </tr>
                  )}

                  {filteredLots.map((lot) => {
                    const st = normalizeStatus(lot.status);
                    const statusLabel = formatStatusLabel(st);

                    let tagClass = "tag tag-muted";
                    if (st === "AVAILABLE") tagClass = "tag tag-success";
                    if (st === "QUARANTINE") tagClass = "tag tag-warning";

                    return (
                      <tr key={lot.material_lot_id}>
                        <td>{lot.material_code}</td>
                        <td>{lot.material_name}</td>
                        <td>{lot.category_code}</td>
                        <td>{lot.type_code}</td>
                        <td>{lot.lot_number}</td>
                        <td>{formatDate(lot.expiry_date)}</td>
                        <td>{lot.manufacturer || "—"}</td>
                        <td className="numeric">{lot.balance_qty}</td>
                        <td>{lot.uom_code}</td>
                        <td>
                          <span className={tagClass} title={buildStatusTooltip(lot)}>
                            {statusLabel}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 12, borderRadius: 999 }}
                            onClick={() => {
                              setSelectedLot(lot);
                              setStatusModalOpen(true);
                            }}
                          >
                            Change
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <LotStatusModal
        open={statusModalOpen}
        lot={selectedLot}
        onClose={() => {
          setStatusModalOpen(false);
          setSelectedLot(null);
        }}
        onStatusChanged={() => {
          onLotStatusChanged?.();
        }}
      />
    </section>
  );
};

export default LiveLotsView;
