// web/src/utils/jsonDiff.ts

export type DiffKind = "add" | "remove" | "change";

export type DiffEntry = {
  path: string;
  kind: DiffKind;
  before: any;
  after: any;
};

const isPlainObject = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);

const joinPath = (base: string, next: string) => (base ? `${base}.${next}` : next);
const joinIndex = (base: string, idx: number) => `${base}[${idx}]`;

export const formatScalar = (v: any) => {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") {
    const s = v.length > 60 ? v.slice(0, 57) + "…" : v;
    return JSON.stringify(s);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    if (s.length > 80) return s.slice(0, 77) + "…";
    return s;
  } catch {
    return String(v);
  }
};

export const diffJson = (before: any, after: any, maxChanges = 50): DiffEntry[] => {
  const out: DiffEntry[] = [];

  const walk = (b: any, a: any, path: string) => {
    if (out.length >= maxChanges) return;
    if (b === a) return;

    if (b === undefined && a !== undefined) {
      out.push({ path, kind: "add", before: b, after: a });
      return;
    }
    if (a === undefined && b !== undefined) {
      out.push({ path, kind: "remove", before: b, after: a });
      return;
    }

    if (Array.isArray(b) && Array.isArray(a)) {
      const maxLen = Math.max(b.length, a.length);
      for (let i = 0; i < maxLen; i++) {
        const bp = b[i];
        const ap = a[i];
        const p = path ? joinIndex(path, i) : `[${i}]`;
        if (i >= b.length) {
          out.push({ path: p, kind: "add", before: undefined, after: ap });
          if (out.length >= maxChanges) return;
          continue;
        }
        if (i >= a.length) {
          out.push({ path: p, kind: "remove", before: bp, after: undefined });
          if (out.length >= maxChanges) return;
          continue;
        }
        walk(bp, ap, p);
        if (out.length >= maxChanges) return;
      }
      return;
    }

    if (isPlainObject(b) && isPlainObject(a)) {
      const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
      const sorted = Array.from(keys).sort();
      for (const k of sorted) {
        const bp = (b as any)[k];
        const ap = (a as any)[k];
        const p = joinPath(path, k);

        if (!(k in b)) {
          out.push({ path: p, kind: "add", before: undefined, after: ap });
          if (out.length >= maxChanges) return;
          continue;
        }
        if (!(k in a)) {
          out.push({ path: p, kind: "remove", before: bp, after: undefined });
          if (out.length >= maxChanges) return;
          continue;
        }
        walk(bp, ap, p);
        if (out.length >= maxChanges) return;
      }
      return;
    }

    out.push({ path, kind: "change", before: b, after: a });
  };

  walk(before, after, "");
  return out;
};

export const summarizeDiff = (entries: DiffEntry[], maxParts = 2) => {
  if (!entries || entries.length === 0) return "—";
  const parts = entries.slice(0, maxParts).map((d) => {
    const label = d.path && d.path.length > 0 ? d.path : "root";
    if (d.kind === "add") return `${label}: +${formatScalar(d.after)}`;
    if (d.kind === "remove") return `${label}: removed ${formatScalar(d.before)}`;
    return `${label}: ${formatScalar(d.before)} → ${formatScalar(d.after)}`;
  });
  if (entries.length > maxParts) parts.push(`+${entries.length - maxParts} more`);
  return parts.join("; ");
};
