import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";
import "./OpeningStockMigrationPanel.css";

type Finding = { row: number; message: string };
type Preview = {
  source_sha256: string;
  material_rows: number;
  materials_to_create: number;
  existing_materials: number;
  opening_lots: number;
  total_value_gbp: string;
  blocked: boolean;
  error_count: number;
  issues: Finding[];
  warning_count: number;
  warnings: Finding[];
};
type ImportRecord = {
  id: number; cutover_date: string; approval_reference: string;
  approved_by: string; imported_at: string; imported_by: string;
  material_count: number; lot_count: number; total_value_gbp: string;
  source_sha256: string;
};
const HEADERS = [
  "record_type", "material_code", "material_name", "category_code",
  "type_code", "uom_code", "material_status", "material_manufacturer",
  "material_supplier", "lot_number", "lot_status", "expiry_date",
  "lot_manufacturer", "lot_supplier", "include_opening", "confirmed_qty",
  "original_unit_cost_gbp", "current_stock_value_gbp",
  "cost_source_reference", "qa_verification_reference", "qa_verified_by",
];
const MONEY = (s: string) => Number(s).toLocaleString("en-GB", {
  style: "currency", currency: "GBP",
});

async function readError(error: unknown): Promise<string> {
  return error instanceof Error ? error.message : "Request failed";
}

export default function OpeningStockMigrationPanel({ canCommit = true }: { canCommit?: boolean }) {
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [cutover, setCutover] = useState(() => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  });
  const [approver, setApprover] = useState("");
  const [reference, setReference] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [history, setHistory] = useState<ImportRecord[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await apiFetch("/admin/migration/history");
    setHistory((await res.json()) as ImportRecord[]);
  }, []);

  useEffect(() => { void loadHistory().catch(() => {}); }, [loadHistory]);

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + HEADERS.join(",") + "\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "StkFlo_Opening_Stock_Template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const chooseFile = async (file?: File) => {
    setError(""); setSuccess(""); setPreview(null);
    setConfirmation(""); setBackedUp(false); setReconciled(false);
    if (!file) { setCsv(""); setFileName(""); return; }
    setFileName(file.name);
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 5_000_000) {
      setCsv(""); setError("Select a .csv file smaller than 5 MB.");
      return;
    }
    setCsv(await file.text());
  };

  const previewFile = async () => {
    setBusy(true); setError(""); setSuccess(""); setPreview(null);
    try {
      const res = await apiFetch("/admin/migration/preview", {
        method: "POST", body: JSON.stringify({ csv_text: csv }),
      });
      setPreview((await res.json()) as Preview);
    } catch (e) {
      setError(await readError(e));
    } finally { setBusy(false); }
  };

  const post = async () => {
    if (!preview || preview.blocked || !backedUp || !reconciled) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const res = await apiFetch("/admin/migration/commit", {
        method: "POST",
        body: JSON.stringify({
          csv_text: csv, source_sha256: preview.source_sha256,
          cutover_date: cutover, approval_reference: reference.trim(),
          approved_by: approver.trim(), confirm: confirmation,
        }),
      });
      const data = (await res.json()) as {
        migration_id: number; lots_created: number; materials_added: number;
        total_value_gbp: string;
      };
      setSuccess(
        "Opening migration #" + data.migration_id + " completed: " +
        data.materials_added + " materials, " + data.lots_created +
        " opening receipts, value " + MONEY(data.total_value_gbp) + "."
      );
      setPreview(null); setCsv(""); setFileName(""); setConfirmation("");
      setBackedUp(false); setReconciled(false);
      await loadHistory();
    } catch (e) { setError(await readError(e)); }
    finally { setBusy(false); }
  };

  const canPost = canCommit && !!preview && !preview.blocked && backedUp && reconciled &&
    confirmation === "IMPORT OPENING STOCK" && approver.trim().length >= 3 &&
    reference.trim().length >= 3 && !!cutover && !busy;

  return (
    <section className="stkflo-migration-panel" aria-labelledby="opening-migration-title">
      <div className="stkflo-migration-header">
        <div>
          <div className="stkflo-migration-eyebrow">STOCK INTEGRITY / CONTROLLED DATA CUTOVER</div>
          <h2 id="opening-migration-title">Opening Stock Migration</h2>
          <p>Import verified current quantities and remaining GBP values as opening goods receipts. Historic consumption is not imported.</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={downloadTemplate}>Download CSV template</button>
      </div>

      <div className="stkflo-migration-warning">
        <strong>Production safety:</strong> Complete and approve lot-by-lot quantities, statuses and costs before import.
        Export a PostgreSQL backup through Admin → Settings → Database Tools before committing.
        This process is identical in Codespaces and on the Windows VM; it uploads a file from your browser.
      </div>

      <div className="stkflo-migration-steps">
        <div className="stkflo-migration-step">
          <h3><span>01</span> Upload cutover CSV</h3>
          <p>A MATERIAL row defines each material once. A LOT row with <code>include_opening=YES</code> posts an opening receipt. Blank/NO lot rows are excluded. Include costs from invoices or an approved valuation.</p>
          <input
            type="file" accept=".csv,text/csv" aria-label="Choose opening stock CSV"
            onChange={e => { void chooseFile(e.target.files?.[0]); }}
          />
          {fileName && <p className="stkflo-migration-small">Selected: {fileName}</p>}
          <button className="btn btn-primary" type="button" disabled={busy || !csv} onClick={() => { void previewFile(); }}>
            {busy ? "Checking…" : "Validate & preview"}
          </button>
        </div>

        {preview && <div className="stkflo-migration-step">
          <h3><span>02</span> Review validation</h3>
          <div className="stkflo-migration-metrics">
            <div><strong>{preview.material_rows}</strong><span>Material definitions</span></div>
            <div><strong>{preview.materials_to_create}</strong><span>New materials</span></div>
            <div><strong>{preview.opening_lots}</strong><span>Opening receipts</span></div>
            <div><strong>{MONEY(preview.total_value_gbp)}</strong><span>Opening value</span></div>
          </div>
          <p className={preview.blocked ? "stkflo-migration-blocked" : "stkflo-migration-ok"}>
            {preview.blocked
              ? "IMPORT BLOCKED · " + preview.error_count + " validation findings. Correct the CSV and preview again."
              : "Validation passed · No stock has been posted. Review all figures before approval."}
          </p>
          {preview.issues.length > 0 && <details open>
            <summary>Blocking findings ({preview.error_count})</summary>
            <ul>{preview.issues.map((f, i) => <li key={i}>CSV row {f.row}: {f.message}</li>)}</ul>
            {preview.error_count > preview.issues.length && <p>Showing the first {preview.issues.length} findings.</p>}
          </details>}
          {preview.warnings.length > 0 && <details>
            <summary>Review warnings ({preview.warning_count})</summary>
            <ul>{preview.warnings.map((f, i) => <li key={i}>CSV row {f.row}: {f.message}</li>)}</ul>
          </details>}
          <p className="stkflo-migration-small">SHA-256: <code>{preview.source_sha256}</code></p>
        </div>}

        {preview && !preview.blocked && canCommit && <div className="stkflo-migration-step">
          <h3><span>03</span> Approve & commit</h3>
          <p>One atomic database transaction will create materials, lots, opening receipts and a migration audit manifest. No historic receipt dates or usage are fabricated.</p>
          <div className="stkflo-migration-fields">
            <label>Cutover date<input type="date" value={cutover} onChange={e => setCutover(e.target.value)} /></label>
            <label>QA approver<input value={approver} maxLength={150} onChange={e => setApprover(e.target.value)} placeholder="Approver full name" /></label>
            <label>Formal approval / reconciliation reference<input value={reference} maxLength={200} onChange={e => setReference(e.target.value)} placeholder="e.g. MIG-2026-001" /></label>
          </div>
          <label className="stkflo-migration-check"><input type="checkbox" checked={backedUp} onChange={e => setBackedUp(e.target.checked)} /> I confirm a restorable database backup has been taken.</label>
          <label className="stkflo-migration-check"><input type="checkbox" checked={reconciled} onChange={e => setReconciled(e.target.checked)} /> I confirm stock quantities, supplier batches, statuses and values were verified and signed off.</label>
          <label className="stkflo-migration-confirm">Type <strong>IMPORT OPENING STOCK</strong> to authorise the irreversible posting:
            <input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <button className="btn btn-primary stkflo-migration-commit" type="button" disabled={!canPost} onClick={() => { void post(); }}>
            {busy ? "Importing…" : "Commit opening stock"}
          </button>
        </div>}
      </div>

      {error && <p className="stkflo-migration-blocked" role="alert">{error}</p>}
      {success && <p className="stkflo-migration-ok" role="status">{success}</p>}

      <div className="stkflo-migration-history">
        <div className="stkflo-migration-history-head"><h3>Previous migrations</h3><button type="button" onClick={() => { void loadHistory().catch(e => setError(String(e))); }}>Refresh</button></div>
        {history.length === 0 ? <p>No recorded opening-stock imports on this database.</p> :
          <div className="stkflo-migration-history-scroll"><table>
            <thead><tr><th>ID</th><th>Cutover</th><th>Imported</th><th>QA reference</th><th>Lots</th><th>Value</th></tr></thead>
            <tbody>{history.map(h => <tr key={h.id}>
              <td>#{h.id}</td><td>{h.cutover_date}</td>
              <td>{new Date(h.imported_at).toLocaleString("en-GB")}</td>
              <td title={h.approved_by}>{h.approval_reference}</td>
              <td>{h.lot_count}</td><td>{MONEY(h.total_value_gbp)}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </section>
  );
}
