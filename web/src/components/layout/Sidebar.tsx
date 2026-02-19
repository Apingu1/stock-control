import React from "react";
import type { UserMe, ViewMode } from "../../types";

export type AlertsCounts = { lowStock: number; lowExpiry: number; total: number };

type Props = {
  me: UserMe | null;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  isAdmin: boolean;
  canViewAudit: boolean;
  alertsCounts: AlertsCounts;
  onLogout: () => void;
};

const Sidebar: React.FC<Props> = ({
  me,
  view,
  setView,
  isAdmin,
  canViewAudit,
  alertsCounts,
  onLogout,
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">SC</div>
        <div>
          <div className="sidebar-title-main">Digital Stock</div>
          <div className="sidebar-title-sub">Control Studio</div>
        </div>
      </div>

      <div className="sidebar-section-label">Workspace</div>
      <ul className="nav-list">
        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "dashboard" ? "active" : "")}
            onClick={() => setView("dashboard")}
            disabled={!me}
            title={!me ? "Please sign in" : ""}
          >
            <span className="icon">📊</span>
            Dashboard
            <span className="badge">Today</span>
          </button>
        </li>
<li className="nav-item">
  <button
    type="button"
    className={"nav-link as-button " + (view === "analytics" ? "active" : "")}
    onClick={() => setView("analytics")}
    disabled={!me}
    title={!me ? "Please sign in" : ""}
  >
    <span className="nav-icon">📈</span>
    <span className="nav-text">Analytics</span>
  </button>
</li>


        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "materials" ? "active" : "")}
            onClick={() => setView("materials")}
            disabled={!me}
            title={!me ? "Please sign in" : ""}
          >
            <span className="icon">🧪</span>
            Materials Library
          </button>
        </li>

        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "receipts" ? "active" : "")}
            onClick={() => setView("receipts")}
            disabled={!me}
            title={!me ? "Please sign in" : ""}
          >
            <span className="icon">📥</span>
            Goods Receipts
          </button>
        </li>

        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "consumption" ? "active" : "")}
            onClick={() => setView("consumption")}
            disabled={!me}
            title={!me ? "Please sign in" : ""}
          >
            <span className="icon">🚚</span>
            Consumption
          </button>
        </li>

        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "lots" ? "active" : "")}
            onClick={() => setView("lots")}
            disabled={!me}
            title={!me ? "Please sign in" : ""}
          >
            <span className="icon">📦</span>
            Live Lots
          </button>
        </li>

        {isAdmin && (
          <>
            <div className="sidebar-section-label sidebar-section-label-admin">
              Admin
            </div>
            <li className="nav-item">
              <button
                type="button"
                className={"nav-link as-button " + (view === "admin" ? "active" : "")}
                onClick={() => setView("admin")}
              >
                <span className="icon">👤</span>
                Users &amp; Roles
              </button>
            </li>

            <li className="nav-item">
              <button
                type="button"
                className={
                  "nav-link as-button " + (view === "admin-settings" ? "active" : "")
                }
                onClick={() => setView("admin-settings")}
              >
                <span className="icon">⚙️</span>
                Settings
              </button>
            </li>
          </>
        )}
      </ul>

      <div className="sidebar-section-label">Risk &amp; Quality</div>
      <ul className="nav-list">
        {/* ✅ Removed placeholder Expiry Watchlist */}

        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "quarantine" ? "active" : "")}
            onClick={() => setView("quarantine")}
            disabled={!me}
            title={!me ? "Please sign in" : ""}
          >
            <span className="icon">📦</span>
            Quarantine
          </button>
        </li>

        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "alerts" ? "active" : "")}
            onClick={() => setView("alerts")}
            disabled={!me}
            title={!me ? "Please sign in" : ""}
          >
            <span className="icon">🚨</span>
            Low Stock &amp; Expiry
            {alertsCounts.total > 0 && <span className="badge">{alertsCounts.total}</span>}
          </button>
        </li>

        <li className="nav-item">
          <button
            type="button"
            className={"nav-link as-button " + (view === "audit" ? "active" : "")}
            onClick={() => setView("audit")}
            disabled={!me || !canViewAudit}
            title={
              !me
                ? "Please sign in"
                : !canViewAudit
                ? "You do not have audit.view permission"
                : ""
            }
          >
            <span className="icon">📑</span>
            Audit Trail
          </button>
        </li>
      </ul>

      <div
        className="sidebar-footer"
        style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}
      >
        {me ? (
          <>
            <div className="avatar-pill" style={{ justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="avatar-img">{me.username.slice(0, 2).toUpperCase()}</div>
                <div className="avatar-meta">
                  <div className="avatar-name">{me.username}</div>
                  <div className="avatar-role">{me.role}</div>
                </div>
              </div>

              <button className="btn btn-ghost" type="button" onClick={onLogout}>
                Logout
              </button>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>GMP Mode</span>
              <span className="pill-muted">Pilot • On-prem</span>
            </div>
          </>
        ) : (
          <div className="info-row">Please sign in.</div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
