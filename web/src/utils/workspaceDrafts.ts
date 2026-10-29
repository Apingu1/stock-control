/** Transient per-tab drafts. Form state stays mounted, never in browser storage. */
export type WorkspaceDraftKind = "material" | "receipt" | "consumption" | "product";
export interface WorkspaceDraft {
  id: string;
  kind: WorkspaceDraftKind;
  index: number;
  dirty: boolean;
}
export const WORKSPACE_DRAFT_LIMIT = 8;
export const DRAFT_LABELS: Record<WorkspaceDraftKind, string> = {
  material: "New Material",
  receipt: "Goods Receipt",
  consumption: "Consumption",
  product: "New Product BMR",
};
export function nextWorkspaceDraft(current: WorkspaceDraft[], kind: WorkspaceDraftKind, id: string): WorkspaceDraft | null {
  if (current.length >= WORKSPACE_DRAFT_LIMIT) return null;
  return {
    id, kind,
    index: current.filter(d => d.kind === kind).reduce((max, d) => Math.max(max, d.index), 0) + 1,
    dirty: false,
  };
}
export function draftLabel(draft: WorkspaceDraft): string {
  return DRAFT_LABELS[draft.kind] + " " + draft.index;
}
