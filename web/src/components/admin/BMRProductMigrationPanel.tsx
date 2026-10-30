import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";
import "./OpeningStockMigrationPanel.css";

type Finding = { file: string; row: number; message: string };
type Planned = { product_code: string; version: string; action: string; material_count: number };
type Preview = {
  source_sha256: string; blocked: boolean; duplicate_import_id: number | null;
  error_count: number; warning_count: number;
  errors: Finding[]; warnings: Finding[];
  products_in_source: number; formula_rows_in_source: number;
  products_to_create: number; products_to_update: number;
  existing_skipped: number; formula_lines_to_import: number;
  plan: Planned[];
};
type History = {
  id:number; imported_at:string; imported_by:string;
  approval_reference:string; products_created:number; formulas_created:number;
  materials_linked:number;
};

const fmtError = (err: unknown) => err instanceof Error ? err.message : String(err);

export default function BMRProductMigrationPanel({ canCommit }: { canCommit: boolean }) {
  const [archive, setArchive] = useState<File | null>(null);
  const [sourceWorkbook, setSourceWorkbook] = useState<File | null>(null);
  const [extractionId, setExtractionId] = useState("");
  const [extractionState, setExtractionState] = useState("");
  const [extractionProgress, setExtractionProgress] = useState("");
  const [extracted, setExtracted] = useState<{
    products: {product_code:string; bmr_version:string; product_name_bmr:string; material_count:number; review_status:string}[];
    issues: {severity:string;product_code:string;bmr_file:string;message:string}[];
    product_count:number; formula_count:number; source_count:number;
  } | null>(null);
  const [productsFile, setProductsFile] = useState("");
  const [formulaFile, setFormulaFile] = useState("");
  const [productsCsv, setProductsCsv] = useState("");
  const [formulasCsv, setFormulasCsv] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [approval, setApproval] = useState("");
  const [confirm, setConfirm] = useState("");
  const [backedUp, setBackedUp] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const loadHistory = useCallback(async () => {
    try {
      const response = await apiFetch("/admin/bmr-migration/history");
      setHistory((await response.json()) as History[]);
    } catch (err: unknown) { setError(fmtError(err)); }
  }, []);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!extractionId || extractionState === "COMPLETE" || extractionState === "FAILED") return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await apiFetch("/admin/bmr-extractor/" + encodeURIComponent(extractionId));
        const status = await response.json() as {
          state:string;progress:string;result:null | {
            products_csv:string; formulas_csv:string;
            products:{product_code:string;bmr_version:string;product_name_bmr:string;material_count:number;review_status:string}[];
            issues:{severity:string;product_code:string;bmr_file:string;message:string}[];
            product_count:number;formula_count:number;source_count:number;
          };
        };
        if (cancelled) return;
        setExtractionProgress(status.progress);
        setExtractionState(status.state);
        if (status.state === "COMPLETE" && status.result) {
          setProductsCsv(status.result.products_csv);
          setFormulasCsv(status.result.formulas_csv);
          setProductsFile("Products.csv · extracted in StkFlo");
          setFormulaFile("Master_Formulas.csv · extracted in StkFlo");
          setExtracted(status.result);
          setPreview(null);
        }
      } catch (err: unknown) { if (!cancelled) setError(fmtError(err)); }
    };
    void check();
    const interval = window.setInterval(() => { void check(); }, 3000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [extractionId, extractionState]);

  const startExtraction = async () => {
    if (!archive) return;
    setBusy(true);setError("");setSuccess("");setPreview(null);setExtracted(null);
    setProductsCsv("");setFormulasCsv("");setProductsFile("");setFormulaFile("");
    setExtractionProgress("Uploading BMR archive…");
    try {
      const form = new FormData();
      form.append("archive", archive);
      if (sourceWorkbook) form.append("product_list", sourceWorkbook);
      const res = await apiFetch("/admin/bmr-extractor/start", {method:"POST", body:form});
      const data = await res.json() as {job_id:string;state:string};
      setExtractionId(data.job_id);
      setExtractionState(data.state);
    } catch (err: unknown) { setError(fmtError(err)); setExtractionProgress(""); }
    finally { setBusy(false); }
  };
  const exportExtractedCsv = (name: string, source: string) => {
    const url = URL.createObjectURL(new Blob([source],{type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href=url;link.download=name;link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const choose = async (file: File | undefined, type: "products" | "formula") => {
    setError(""); setSuccess(""); setPreview(null); setConfirm(""); setBackedUp(false); setVerified(false);
    if (file && !file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV exported by StkFlo BMR Extractor."); return;
    }
    if (type === "products") {
      setProductsFile(file?.name || ""); setProductsCsv(file ? await file.text() : "");
    } else {
      setFormulaFile(file?.name || ""); setFormulasCsv(file ? await file.text() : "");
    }
  };

  const source = {products_csv: productsCsv, formulas_csv: formulasCsv, update_existing: updateExisting};
  const validate = async () => {
    setBusy(true); setError(""); setSuccess(""); setPreview(null);
    try {
      const res = await apiFetch("/admin/bmr-migration/preview", {
        method: "POST", body: JSON.stringify(source)
      });
      setPreview((await res.json()) as Preview);
    } catch (err: unknown) { setError(fmtError(err)); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!preview || preview.blocked || !canCommit || !verified || !backedUp) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const res = await apiFetch("/admin/bmr-migration/commit", {
        method: "POST",
        body: JSON.stringify({...source, source_sha256:preview.source_sha256,
          approval_reference:approval.trim(), confirm})
      });
      const result = await res.json() as {
        migration_id:number; products_created:number; products_updated:number; formula_lines:number;
      };
      setSuccess("Import #" + result.migration_id + " committed: " + result.products_created +
        " products created, " + result.products_updated + " newer BMR versions, " +
        result.formula_lines + " formula lines linked.");
      setPreview(null); setConfirm(""); setVerified(false); setBackedUp(false);
      void loadHistory();
    } catch (err: unknown) { setError(fmtError(err)); }
    finally { setBusy(false); }
  };
  const ready = !!productsCsv && !!formulasCsv;
  const canPost = !!preview && !preview.blocked && !!approval.trim() &&
    confirm === "IMPORT PRODUCT BMRS" && verified && backedUp && canCommit && !busy;

  return (
    <section className="stkflo-migration-panel" aria-labelledby="bmr-migration-title">
      <div className="stkflo-migration-header">
        <div>
          <div className="stkflo-migration-eyebrow">CONTROLLED MASTER DATA / SOURCE-TRACEABLE CUTOVER</div>
          <h2 id="bmr-migration-title">BMR Product & Formula Migration</h2>
          <p>Only BMRs extracted into Products.csv and Master_Formulas.csv are considered.
            The full source product list is not imported. No stock receipts or issues are posted.</p>
        </div>
      </div>
      <div className="stkflo-migration-warning">
        Before committing, create and verify a PostgreSQL backup using Admin → Settings → Database Tools.
        Imported formulas are reference-only: they do not calculate manufacturing quantities or change stock.
      </div>
      <div className="stkflo-migration-steps">
        <div className="stkflo-migration-step">
          <h3><span>01</span> Extract BMR documents or upload ready CSVs</h3>
          <p>Preferred: upload the original A–Z BMR ZIP. The product list is read from within the ZIP,
             or you can supply it separately. The server extracts Section 4 formulas and then prepares
             the same canonical CSVs accepted by Stage 2. For larger archives this runs as a tracked job.</p>
          <div className="stkflo-migration-fields">
            <label className="form-group"><span className="label">Original BMR ZIP (.doc/.docx)</span>
              <input className="input" type="file" accept=".zip,application/zip"
                onChange={e => {setArchive(e.target.files?.[0] || null);setPreview(null);}} /></label>
            <label className="form-group"><span className="label">Product List XLSX/XLSM (optional if already in ZIP)</span>
              <input className="input" type="file" accept=".xlsx,.xlsm"
                onChange={e => setSourceWorkbook(e.target.files?.[0] || null)} /></label>
          </div>
          <button type="button" className="btn btn-primary"
            disabled={!archive || busy || extractionState === "RUNNING"}
            onClick={() => void startExtraction()}>
            {busy ? "Uploading…" : "Extract BMRs in StkFlo"}
          </button>
          {extractionProgress && <p role="status" className={extractionState === "FAILED" ?
            "stkflo-migration-blocked" : "stkflo-migration-small"}>{extractionProgress}</p>}
          {extracted && <div style={{marginTop:12}}>
            <div className="stkflo-migration-metrics">
              <div><strong>{extracted.source_count}</strong><span>Source BMRs</span></div>
              <div><strong>{extracted.product_count}</strong><span>Extracted products</span></div>
              <div><strong>{extracted.formula_count}</strong><span>Formula rows</span></div>
              <div><strong>{extracted.issues.length}</strong><span>Review findings</span></div>
            </div>
            <details open><summary>Extracted BMR preview ({extracted.product_count} records)</summary>
              <div style={{maxHeight:280,overflow:"auto"}}>
                <table className="sf-ops-table"><thead><tr>
                  <th>Product code</th><th>Version</th><th>Product</th><th>Materials</th><th>Extraction check</th>
                </tr></thead><tbody>{extracted.products.map((p,i)=><tr key={p.product_code+"-"+i}>
                  <td>{p.product_code}</td><td>{p.bmr_version}</td><td>{p.product_name_bmr}</td>
                  <td>{p.material_count}</td><td>{p.review_status}</td>
                </tr>)}</tbody></table>
              </div>
            </details>
            {extracted.issues.length>0 && <details><summary>
              Review extraction findings ({extracted.issues.length})
            </summary><div style={{maxHeight:220,overflowY:"auto"}}>
              {extracted.issues.map((f,i)=><p key={i}>{f.product_code} · {f.bmr_file}: {f.message}</p>)}
            </div></details>}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
              <button type="button" className="btn btn-ghost"
                onClick={()=>exportExtractedCsv("Products.csv",productsCsv)}>Download Products.csv</button>
              <button type="button" className="btn btn-ghost"
                onClick={()=>exportExtractedCsv("Master_Formulas.csv",formulasCsv)}>Download Master_Formulas.csv</button>
              <button type="button" className="btn btn-primary" onClick={() => void validate()}>
                Continue to Stage 2 · Validate Products & Formulas
              </button>
            </div>
          </div>}
          <details style={{marginTop:12}}><summary>Or upload pre-extracted CSVs (standalone extractor fallback)</summary>
          <p>Use the output files exactly as produced by the BMR Extractor.
             Products are linked by product code and BMR version. The standalone extractor remains available
             for offline processing or as a backup method.</p>
          <div className="stkflo-migration-fields">
            <label className="form-group"><span className="label">Products.csv</span>
              <input className="input" type="file" accept=".csv,text/csv"
                onChange={e => void choose(e.target.files?.[0], "products")} />
              {productsFile && <small>{productsFile}</small>}
            </label>
            <label className="form-group"><span className="label">Master_Formulas.csv</span>
              <input className="input" type="file" accept=".csv,text/csv"
                onChange={e => void choose(e.target.files?.[0], "formula")} />
              {formulaFile && <small>{formulaFile}</small>}
            </label>
          </div>

          <button className="btn btn-primary" type="button" disabled={!ready || busy}
            onClick={() => void validate()}>{busy ? "Checking…" : "Validate & preview CSVs"}</button>
          </details>
                    <label className="stkflo-migration-check">
            <input type="checkbox" checked={updateExisting} onChange={e=>{
              setUpdateExisting(e.target.checked); setPreview(null); setConfirm("");
            }} />
            <span>Allow importing a newer BMR version for an existing product
              (updates current mandatory materials; keeps older formula versions)</span>
          </label>
        </div>
        {preview && <div className="stkflo-migration-step">
          <h3><span>02</span> Review matched products and formula lines</h3>
          <div className="stkflo-migration-metrics">
            <div><strong>{preview.products_to_create}</strong><span>New products</span></div>
            <div><strong>{preview.products_to_update}</strong><span>Updated versions</span></div>
            <div><strong>{preview.formula_lines_to_import}</strong><span>Formula lines</span></div>
            <div><strong>{preview.existing_skipped}</strong><span>Existing skipped</span></div>
          </div>
          <p className={preview.blocked ? "stkflo-migration-blocked" : "stkflo-migration-ok"}>
            {preview.blocked ? "VALIDATION BLOCKED — correct errors before import." :
              "VALIDATION PASSED — inspect the import plan before approval."}
          </p>
          {preview.duplicate_import_id != null && <p className="stkflo-migration-blocked">
            This source package was imported previously (ID {preview.duplicate_import_id}).
          </p>}
          {preview.errors.length > 0 && <details open><summary>Blocking findings ({preview.error_count})</summary>
            <div style={{maxHeight:240,overflowY:"auto"}}>
              {preview.errors.map((f,i)=><p key={i}>{f.file} row {f.row}: {f.message}</p>)}
            </div></details>}
          {preview.warnings.length > 0 && <details><summary>Review warnings ({preview.warning_count})</summary>
            <div style={{maxHeight:240,overflowY:"auto"}}>
              {preview.warnings.map((f,i)=><p key={i}>{f.file} row {f.row}: {f.message}</p>)}
            </div></details>}
          <details open><summary>Import plan ({preview.plan.length} products)</summary>
            <div style={{maxHeight:340,overflow:"auto"}}>
              <table className="sf-ops-table"><thead><tr>
                <th>Product code</th><th>BMR version</th><th>Action</th><th>Materials</th>
              </tr></thead><tbody>{preview.plan.map((p,i)=><tr key={p.product_code+"-"+i}>
                <td>{p.product_code}</td><td>{p.version}</td><td>{p.action.replaceAll("_"," ")}</td>
                <td>{p.material_count}</td>
              </tr>)}</tbody></table>
            </div>
          </details>
          <small>SHA-256: {preview.source_sha256}</small>
        </div>}
        {preview && !preview.blocked && canCommit && <div className="stkflo-migration-step">
          <h3><span>03</span> Approve & commit</h3>
          <p>Atomic import: creates product master records, current mandatory material
             links, versioned formula rows and an audit manifest. Existing stock is unchanged.</p>
          <label className="form-group"><span className="label">Formal approval reference</span>
            <input className="input" value={approval} onChange={e=>setApproval(e.target.value)}
              placeholder="QA approval / change reference" />
          </label>
          <label className="stkflo-migration-check"><input type="checkbox" checked={backedUp}
            onChange={e=>setBackedUp(e.target.checked)}/>I confirm the database backup has been verified.</label>
          <label className="stkflo-migration-check"><input type="checkbox" checked={verified}
            onChange={e=>setVerified(e.target.checked)}/>
            I have reviewed the source BMRs, product classifications and matched formula lines.</label>
          <label className="form-group"><span className="label">Type IMPORT PRODUCT BMRS</span>
            <input className="input" value={confirm} onChange={e=>setConfirm(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary" disabled={!canPost}
            onClick={() => void commit()}>{busy ? "Importing…" : "Commit BMR products"}</button>
        </div>}
        {preview && !preview.blocked && !canCommit && <p>
          Validation complete. Your role does not have the data_migration.commit permission.
        </p>}
      </div>
      {error && <p className="stkflo-migration-blocked" role="alert">{error}</p>}
      {success && <p className="stkflo-migration-ok" role="status">{success}</p>}
      <div className="stkflo-migration-history">
        <div className="stkflo-migration-history-head">
          <h3>Previous BMR migrations</h3>
          <button className="btn btn-ghost" type="button" onClick={() => void loadHistory()}>Refresh</button>
        </div>
        <div className="stkflo-migration-history-scroll"><table>
          <thead><tr><th>ID</th><th>Date</th><th>User</th><th>Approval</th><th>Created</th><th>Updated</th><th>Lines</th></tr></thead>
          <tbody>{history.map(h=><tr key={h.id}><td>{h.id}</td><td>{h.imported_at.slice(0,16).replace("T"," ")}</td>
            <td>{h.imported_by}</td><td>{h.approval_reference}</td><td>{h.products_created}</td>
            <td>{h.formulas_created-h.products_created}</td><td>{h.materials_linked}</td></tr>)}</tbody>
        </table></div>
      </div>
    </section>
  );
}
