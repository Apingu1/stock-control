import type { HTMLAttributes } from "react";

/** Presentation only: filtering and record access remain owned by each page. */
export interface OperationalResultBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  total: number;
  visible: number;
  noun: string;
  isFiltered?: boolean;
  onClear?: () => void;
  busy?: boolean;
}

export default function OperationalResultBar({
  total,
  visible,
  noun,
  isFiltered = false,
  onClear,
  busy = false,
  className = "",
  ...props
}: OperationalResultBarProps) {
  return (
    <div {...props} className={["sf-ops-results", className].filter(Boolean).join(" ")}>
      <div className="sf-ops-result-count" aria-live="polite" aria-atomic="true">
        <span className="sf-ops-result-icon" aria-hidden="true" />
        {busy ? <span>Updating records…</span> : (
          <span>
            <strong>{visible.toLocaleString("en-GB")}</strong>
            {isFiltered ? " of " + total.toLocaleString("en-GB") : ""}
            {" "}{noun}{isFiltered ? " matching" : ""}
          </span>
        )}
      </div>
      {isFiltered && onClear && (
        <button type="button" className="sf-ops-clear" onClick={onClear} disabled={busy}>
          Clear filters
        </button>
      )}
    </div>
  );
}
