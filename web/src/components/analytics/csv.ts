export function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(headers: string[], rows: any[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(","));
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

export function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function firstDayOfMonth(): string {
  const now = new Date();
  return ymd(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function todayYmd(): string {
  return ymd(new Date());
}
