// web/src/components/alerts/alertsUi.tsx
import React from "react";
import type { AlertState } from "./alertsTypes";
import { STATE_OPTIONS, stateBadgeKind } from "./alertsTypes";

export const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "rgba(226, 232, 240, 0.9)",
  padding: "12px 14px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: "rgba(15, 23, 42, 0.92)",
  backdropFilter: "blur(6px)",
};

export const tdStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "12px 14px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.08)",
  verticalAlign: "middle",
};

export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

export function badge(text: string, kind: "neutral" | "warn" | "critical") {
  const bg =
    kind === "critical"
      ? "rgba(239, 68, 68, 0.18)"
      : kind === "warn"
      ? "rgba(245, 158, 11, 0.18)"
      : "rgba(99, 102, 241, 0.18)";
  const border =
    kind === "critical"
      ? "rgba(239, 68, 68, 0.35)"
      : kind === "warn"
      ? "rgba(245, 158, 11, 0.35)"
      : "rgba(99, 102, 241, 0.35)";
  const color =
    kind === "critical"
      ? "rgba(252, 165, 165, 1)"
      : kind === "warn"
      ? "rgba(253, 186, 116, 1)"
      : "rgba(199, 210, 254, 1)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: "16px",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export function sectionHeader(
  title: string,
  count: number,
  kind: "neutral" | "warn" | "critical"
) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      </div>
      <div>{badge(`${count} flagged`, kind)}</div>
    </div>
  );
}

export function formatQty(n: number) {
  // Keep numeric fidelity but avoid ugly long decimals.
  // - If integer-ish => show no decimals
  // - Else show up to 3 decimals (trimmed)
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-9) return String(rounded);
  const s = v.toFixed(3);
  return s.replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
}

export function stateLabel(s: AlertState) {
  return STATE_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function stateBadge(s: AlertState) {
  return badge(stateLabel(s), stateBadgeKind(s));
}
