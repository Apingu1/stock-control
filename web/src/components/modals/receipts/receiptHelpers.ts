// web/src/components/modals/receipts/receiptHelpers.ts

export function calcUnitCost(qty: string, totalCost: string): number | null {
  const q = Number(qty);
  const t = Number(totalCost);
  if (!Number.isFinite(q) || q <= 0) return null;
  if (!Number.isFinite(t) || t <= 0) return null;

  const unit = t / q;
  // show to 4 dp (same convention as backend)
  return Math.round((unit + Number.EPSILON) * 10000) / 10000;
}
