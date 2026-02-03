// web/src/components/analytics/reportPrint.ts

export function escapeHtml(s: any): string {
  const str = String(s ?? "");
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildHtmlDoc(title: string, bodyHtml: string): string {
  const css = `
    :root {
      --bg: #0b1020;
      --border: rgba(255,255,255,0.10);
      --text: rgba(255,255,255,0.92);
      --muted: rgba(255,255,255,0.68);
      --accent: #8b5cf6;
      --accent2: #6366f1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      color: var(--text);
      background: var(--bg);
      padding: 28px;
    }
    .wrap { max-width: 1020px; margin: 0 auto; }
    .hdr {
      display:flex; align-items:flex-start; justify-content:space-between;
      gap: 14px; padding: 18px 18px; border: 1px solid var(--border);
      background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.10));
      border-radius: 16px;
    }
    .h1 { font-size: 18px; font-weight: 800; letter-spacing: 0.2px; margin: 0; }
    .sub { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.4; }

    .pill { display:inline-flex; gap:8px; align-items:center; padding: 6px 10px;
      border: 1px solid var(--border); background: rgba(0,0,0,0.18); border-radius: 999px;
      font-size: 12px; color: var(--muted);
    }

    .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
    .kpi { border: 1px solid var(--border); background: rgba(255,255,255,0.05); border-radius: 16px; padding: 12px 14px; }
    .kpi .lab { color: var(--muted); font-size: 12px; }
    .kpi .val { margin-top: 6px; font-size: 18px; font-weight: 800; }

    .card { margin-top: 14px; border: 1px solid var(--border); background: rgba(255,255,255,0.05); border-radius: 16px; padding: 14px; }
    .ct { font-size: 13px; font-weight: 800; margin: 0 0 10px; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.10); vertical-align: top; }

    /* Keep header a touch softer, but not "greyed out" */
    th { text-align: left; color: rgba(255,255,255,0.86); font-weight: 800; }

    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

    /* ✅ User request: make "fixed text data" not greyed out */
    .muted { color: var(--text); }

    .footer { margin-top: 14px; color: var(--text); font-size: 11px; display:flex; justify-content:space-between; gap: 10px; }

    /* Better PDF pagination */
    .card { page-break-inside: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }

    @media print {
      body { background: white; color: #111; padding: 0; }
      .hdr, .kpi, .card { background: white; border-color: #ddd; }
      th, td { border-bottom-color: #eee; }
      th { color: #111; }
      /* ✅ User request: black text in print */
      .muted { color: #111; }
      .footer { color: #111; }
      .pill { border-color: #ddd; background: #fff; color: #111; }
      .sub { color: #111; }
      .kpi .lab { color: #111; }
    }
  `;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>${css}</style>
      </head>
      <body>
        <div class="wrap">
          ${bodyHtml}
          <div class="footer">
            <div>Generated from the Stock Control Analytics UI (exact visible data).</div>
            <div class="mono">${escapeHtml(new Date().toISOString())}</div>
          </div>
        </div>
        <script>
          setTimeout(() => { try { window.focus(); window.print(); } catch(e) {} }, 150);
        </script>
      </body>
    </html>
  `;
}

function printViaIframe(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 500);
    }
  }, 250);
}

export function openPrintWindow(title: string, bodyHtml: string) {
  const html = buildHtmlDoc(title, bodyHtml);

  try {
    const w = window.open("", "_blank", "width=1100,height=900");
    if (w && w.document) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      return;
    }
  } catch {
    // ignore and fallback
  }

  printViaIframe(html);
}

export function moneyText(v: any): string {
  if (v === null || v === undefined || v === "") return "0.00";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
