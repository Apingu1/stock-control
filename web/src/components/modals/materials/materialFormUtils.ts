import type { ApprovedManufacturer, Material } from "../../../types";

export function toNumOrEmpty(v: any): number | "" {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

export function normalize(s: string) {
  return s.trim().toUpperCase();
}

export function isOverrideEnabledFromInitial(initial?: Partial<Material>) {
  return (
    (initial as any)?.auto_quarantine_override_days !== null &&
    (initial as any)?.auto_quarantine_override_days !== undefined
  );
}

export function findExistingApproved(
  approvedManufacturers: ApprovedManufacturer[],
  name: string
) {
  const n = normalize(name);
  return approvedManufacturers.find((a) => normalize(a.manufacturer_name) === n);
}

export function buildPendingAddsNormalized(pendingAddNames: string[]) {
  return new Set(pendingAddNames.map(normalize));
}
