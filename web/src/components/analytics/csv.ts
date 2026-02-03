// web/src/components/analytics/csv.ts
/**
 * Central CSV helpers for Analytics.
 *
 * Standardisation rules:
 *  - Date-only YYYY-MM-DD  -> DD-MM-YYYY
 *  - Datetime ISO strings  -> DD/MM/YYYY, HH:MM:SS (en-GB, 24h)
 *    (handles Postgres microseconds by trimming to milliseconds)
 *
 * Compatibility:
 *  - Preserve legacy exports used by AnalyticsView: todayYmd, firstDayOfMonth
 */

const LONDON_TZ = "Europe/London";

/* ------------------------- Legacy date helpers ------------------------- */

/**
 * Returns today's date as YYYY-MM-DD in Europe/London.
 * (Used by AnalyticsView defaults)
 */
export function todayYmd() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dd = get("day");
  const mm = get("month");
  const yyyy = get("year");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns first day of month as YYYY-MM-DD for a given date.
 * IMPORTANT: must be null-safe because callers may pass undefined during initial render.
 */
export function firstDayOfMonth(d?: Date | string | null) {
  if (d === null || d === undefined) return "";

  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";

  // Compute year/month in London
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const yyyy = get("year");
  const mm = get("month");

  if (!yyyy || !mm) return "";
  return `${yyyy}-${mm}-01`;
}

/* ------------------------- Formatting utilities ------------------------- */

function escapeCsvCell(value: string) {
  let v = value;
  if (v.includes('"')) v = v.replaceAll('"', '""');
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v}"`;
  }
  return v;
}

// YYYY-MM-DD -> DD-MM-YYYY
function fmtDateDmy(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Datetime formatter:
 * - Normalise space -> T
 * - Trim Postgres microseconds -> milliseconds
 * - Format as DD/MM/YYYY, HH:MM:SS (en-GB, 24h)
 */
function fmtDateTimeUi(iso: string) {
  let s = iso.trim();

  // Convert "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
  if (s.includes(" ") && !s.includes("T")) {
    const i = s.indexOf(" ");
    s = s.slice(0, i) + "T" + s.slice(i + 1);
  }

  // Trim microseconds to milliseconds when TZ suffix exists
  s = s.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2})$)/, "$1");
  // Also trim if no TZ suffix
  s = s.replace(/(\.\d{3})\d+$/, "$1");

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return iso;

  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function looksLikeIsoDateOnly(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function looksLikeIsoDateTime(v: string) {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(v);
}

function normalizeCell(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);

  const s = String(value);

  if (looksLikeIsoDateOnly(s)) return fmtDateDmy(s);
  if (looksLikeIsoDateTime(s)) return fmtDateTimeUi(s);

  return s;
}

/* ------------------------------ Public API ------------------------------ */

export function buildCsv(headers: string[], rows: any[][]) {
  const lines: string[] = [];
  lines.push(headers.map((h) => escapeCsvCell(String(h))).join(","));

  for (const row of rows) {
    const norm = row.map((cell) => escapeCsvCell(normalizeCell(cell)));
    lines.push(norm.join(","));
  }

  return lines.join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
