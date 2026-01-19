// web/src/components/modals/issues/issueHelpers.ts

export type ConsumptionTypeCode = "USAGE" | "WASTAGE" | "DESTRUCTION" | "R_AND_D";

export function formatDateShort(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);

  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();

  return `${day}-${month}-${year}`; // DD-MM-YYYY
}

export function rankLotStatus(s: string) {
  const x = (s || "").toUpperCase();
  if (x === "AVAILABLE") return 1;
  if (x === "QUARANTINE") return 2;
  if (x === "REJECTED") return 3;
  return 9;
}
