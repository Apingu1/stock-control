import type { WorkspaceDraft, WorkspaceDraftKind } from "../../utils/workspaceDrafts";
import { draftLabel } from "../../utils/workspaceDrafts";

type Props = {
  drafts: WorkspaceDraft[];
  onRestore: (id: string) => void;
  onDiscard: (id: string) => void;
  onNew: (kind: WorkspaceDraftKind) => void;
};
const glyph: Record<WorkspaceDraftKind, string> = { material: "M", receipt: "R", consumption: "C", product: "P" };

/** A dock does not save, submit or persist any form. */
export default function WorkspaceDock({ drafts, onRestore, onDiscard, onNew }: Props) {
  if (!drafts.length) return null;
  return (
    <aside className="sf-workspace-dock" aria-label="Minimised workspace drafts">
      <div className="sf-workspace-dock-top">
        <div className="sf-workspace-dock-heading">
          <span className="sf-workspace-dock-dot" aria-hidden="true" />
          Workspace drafts <span className="sf-workspace-dock-count">{drafts.length}</span>
        </div>
        <div className="sf-workspace-dock-new" aria-label="Start another draft">
          <button type="button" onClick={() => onNew("product")}>+ Product BMR</button>
          <button type="button" onClick={() => onNew("material")}>+ Material</button>
          <button type="button" onClick={() => onNew("receipt")}>+ Receipt</button>
          <button type="button" onClick={() => onNew("consumption")}>+ Consumption</button>
        </div>
      </div>
      <div className="sf-workspace-dock-list">
        {drafts.map((draft) => (
          <div className="sf-workspace-dock-item" key={draft.id}>
            <button type="button" className="sf-workspace-dock-restore"
              onClick={() => onRestore(draft.id)}
              title={"Restore " + draftLabel(draft)}
              aria-label={"Restore " + draftLabel(draft)}>
              <span className={"sf-workspace-dock-glyph sf-draft-" + draft.kind}>{glyph[draft.kind]}</span>
              <span className="sf-workspace-dock-item-text">
                <span className="sf-workspace-dock-item-title">{draftLabel(draft)}</span>
                <span className="sf-workspace-dock-item-state">{draft.dirty ? "Unsaved changes" : "New draft"}</span>
              </span>
            </button>
            <button type="button" className="sf-workspace-dock-discard"
              onClick={() => onDiscard(draft.id)}
              aria-label={"Discard " + draftLabel(draft)}
              title={"Discard " + draftLabel(draft)}>×</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
