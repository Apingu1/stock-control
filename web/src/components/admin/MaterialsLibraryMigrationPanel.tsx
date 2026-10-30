import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";
import "./OpeningStockMigrationPanel.css";

type Finding = { row: number; message: string };
type Preview = {
  source_sha256: string;
  materials: number;
  to_create: number;
  existing_to_update: number;
  low_stock_populated: number;
  expiry_90_days: number;
  stock_receipts: number;
  blocked: boolean;
  error_count: number;
  warning_count: number;
  errors: Finding[];
  warnings: Finding[];
};
type History = {
  id: number;
  imported_at: string;
  imported_by: string;
  approval_reference: string;
  materials_created: number;
  materials_updated: number;
};

const HEADERS = [
  "material_code", "material_name", "category_code", "type_code",
  "base_uom_code", "material_status", "manufacturer", "supplier",
  "low_stock_threshold_qty", "expiry_alert_days",
  "manufacturer_source", "supplier_source", "review_notes",
];

function readableError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function MaterialsLibraryMigrationPanel({ canCommit }: {canCommit: boolean}) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [approval, setApproval] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [backup, setBackup] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadHistory = useCallback(async () => {
    const result = await apiFetch("/admin/material-migration/history");
    setHistory(await result.json() as History[]);
  }, []);
  useEffect(() => { void loadHistory().catch(() => {}); }, [loadHistory]);

  const downloadTemplate = () => {
    const blob = new Blob(["\ufeff" + HEADERS.join(",") + "\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "StkFlo_Material_Library_Import_Template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const chooseFile = async (file: File | undefined) => {
    setError(""); setSuccess(""); setPreview(null);
    setBackup(false); setReviewed(false); setConfirmation("");
    if (!file) {
      setCsv(""); setFilename(""); return;
    }
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > 5_000_000) {
      setError("Choose a UTF-8 CSV no larger than 5 MB.");
      setCsv(""); setFilename(""); return;
    }
    setFilename(file.name);
    setCsv(await file.text());
  };

  const validate = async () => {
    setBusy(true); setError(""); setSuccess(""); setPreview(null);
    try {
      const result = await apiFetch("/admin/material-migration/preview", {
        method: "POST", body: JSON.stringify({ csv_text: csv }),
      });
      setPreview(await result.json() as Preview);
    } catch (err) {
      setError(readableError(err));
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview || preview.blocked || !canCommit || !backup || !reviewed) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await apiFetch("/admin/material-migration/commit", {
        method: "POST",
        body: JSON.stringify({
          csv_text: csv,
          source_sha256: preview.source_sha256,
          approval_reference: approval.trim(),
          confirm: confirmation,
        }),
      });
      const done = await result.json() as { import_id: number; materials_created: number; materials_updated: number };
      setSuccess(
        "Import #" + done.import_id + " complete: " + done.materials_created +
        " materials created and " + done.materials_updated +
        " existing materials updated. No stock transactions created."
      );
      setCsv(""); setFilename(""); setPreview(null); setApproval("");
      setConfirmation(""); setBackup(false); setReviewed(false);
      await loadHistory();
    } catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  };

  const isReady = !!preview && !preview.blocked && canCommit && backup &&
    reviewed && approval.trim().length >= 3 &&
    confirmation === "IMPORT MATERIAL LIBRARY" && !busy;

  return (
    <section className="stkflo-migration-panel" aria-labelledby="material-library-migration-title">
      <div className="stkflo-migration-header">
        <div>
          <div className="stkflo-migration-eyebrow">MATERIAL CATALOGUE · NO STOCK POSTING</div>
          <h2 id="material-library-migration-title">Materials Library Migration</h2>
          <p>Upload material master data, initial supplier/manufacturer information,
            low-stock quantity thresholds and expiry-alert days. No batches,
            receipts, usage or stock values are created.</p>
        </div>
        <button type="button" className="btn secondary" onClick={downloadTemplate}>Download CSV template</button>
      </div>
      <div className="stkflo-migration-warning">
        <strong>Controlled import.</strong> Existing codes are matched and their names are aligned to the reviewed CSV
        for BMR formula consistency; classification, unit, status and compliance approval
        are preserved. Low-stock and expiry alerts are updated, and missing vendor fields can be populated.
        Existing supplier/manufacturer details are preserved.
        Historical supplier names do not automatically become approved manufacturers.
      </div>

      <div className="stkflo-migration-steps">
        <div className="stkflo-migration-step">
          <h3><span>01</span> Upload Materials Library CSV</h3>
          <input aria-label="Choose Materials Library import CSV" type="file"
            accept=".csv,text/csv" onChange={e => { void chooseFile(e.target.files?.[0]); }} />
          {filename && <p className="stkflo-migration-small">Selected: {filename}</p>}
          <button className="btn" type="button" disabled={!csv || busy} onClick={() => { void validate(); }}>
            {busy ? "Validating…" : "Validate & preview"}
          </button>
        </div>

        {preview && <div className="stkflo-migration-step">
          <h3><span>02</span> Review material changes</h3>
          <div className="stkflo-migration-metrics">
            <div><strong>{preview.materials}</strong><span>Materials in CSV</span></div>
            <div><strong>{preview.to_create}</strong><span>New materials</span></div>
            <div><strong>{preview.existing_to_update}</strong><span>Existing matches</span></div>
            <div><strong>{preview.expiry_90_days}</strong><span>90-day alerts</span></div>
          </div>
          <p className="stkflo-migration-small">
            {preview.low_stock_populated} minimum-stock thresholds present.
            Stock receipts: {preview.stock_receipts}. File SHA-256: <code>{preview.source_sha256}</code>
          </p>
          <p className={preview.blocked ? "stkflo-migration-blocked" : "stkflo-migration-ok"}>
            {preview.blocked
              ? "Import blocked — correct " + preview.error_count + " validation errors."
              : "Validation passed. Nothing has been imported."}
          </p>
          {preview.errors.length > 0 && <details open>
            <summary>Blocking findings ({preview.error_count})</summary>
            <ul>{preview.errors.map((f, i) => <li key={i}>CSV row {f.row}: {f.message}</li>)}</ul>
          </details>}
          {preview.warnings.length > 0 && <details>
            <summary>Review warnings ({preview.warning_count})</summary>
            <ul>{preview.warnings.map((f, i) => <li key={i}>CSV row {f.row}: {f.message}</li>)}</ul>
            {preview.warning_count > preview.warnings.length &&
              <p>Showing the first {preview.warnings.length} warnings.</p>}
          </details>}
        </div>}

        {preview && !preview.blocked && canCommit && <div className="stkflo-migration-step">
          <h3><span>03</span> Approve & import materials</h3>
          <p>Importing creates or updates material master records in a single
            transaction. No live lot balances are affected.</p>
          <div className="stkflo-migration-fields">
            <label>Formal approval / change reference
              <input value={approval} maxLength={200}
                onChange={e => setApproval(e.target.value)}
                placeholder="e.g. MAT-MIG-2026-001" />
            </label>
          </div>
          <label className="stkflo-migration-check">
            <input type="checkbox" checked={backup}
              onChange={e => setBackup(e.target.checked)} />
            I confirm a restorable backup of this database has been taken.
          </label>
          <label className="stkflo-migration-check">
            <input type="checkbox" checked={reviewed}
              onChange={e => setReviewed(e.target.checked)} />
            I have checked material classifications, minimum stock, expiry alerts,
            supplier/manufacturer evidence and review flags.
          </label>
          <label className="stkflo-migration-confirm">
            Type <strong>IMPORT MATERIAL LIBRARY</strong> to confirm:
            <input value={confirmation} autoComplete="off" spellCheck={false}
              onChange={e => setConfirmation(e.target.value)} />
          </label>
          <button className="btn stkflo-migration-commit" type="button"
            disabled={!isReady} onClick={() => { void commit(); }}>
            {busy ? "Importing…" : "Commit Materials Library"}
          </button>
        </div>}
      </div>

      {!canCommit && <p className="stkflo-migration-warning">Your role permits previews only; commit permission is required to import.</p>}
      {error && <p className="stkflo-migration-blocked" role="alert">{error}</p>}
      {success && <p className="stkflo-migration-ok" role="status">{success}</p>}

      <div className="stkflo-migration-history">
        <div className="stkflo-migration-history-head">
          <h3>Materials Library import history</h3>
          <button type="button" onClick={() => { void loadHistory().catch(err => setError(readableError(err))); }}>Refresh</button>
        </div>
        {history.length === 0 ? <p>No material-only imports have been recorded.</p> :
          <div className="stkflo-migration-history-scroll"><table>
            <thead><tr><th>ID</th><th>Imported</th><th>Actor</th><th>Approval</th><th>Created</th><th>Updated</th></tr></thead>
            <tbody>{history.map(h => <tr key={h.id}>
              <td>#{h.id}</td><td>{new Date(h.imported_at).toLocaleString("en-GB")}</td>
              <td>{h.imported_by}</td><td>{h.approval_reference}</td>
              <td>{h.materials_created}</td><td>{h.materials_updated}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </section>
  );
}
