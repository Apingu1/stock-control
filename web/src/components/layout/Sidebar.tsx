import React, { useEffect, useState } from "react";
import type { UserMe, ViewMode } from "../../types";

export type AlertsCounts = { lowStock: number; lowExpiry: number; total: number };

type Props = {
  me: UserMe | null;
  view: ViewMode;
  setView: (view: ViewMode) => void;
  isAdmin: boolean;
  canViewAudit: boolean;
  canViewProducts: boolean;
  alertsCounts: AlertsCounts;
  onLogout: () => void;
};

type IconName =
  | "dashboard" | "products" | "analytics" | "materials" | "receipts"
  | "consumption" | "lots" | "users" | "settings" | "quarantine"
  | "alerts" | "audit" | "migration" | "menu" | "close" | "logout" | "chevron";

function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.4"/><rect x="14" y="3" width="7" height="5" rx="1.4"/><rect x="14" y="12" width="7" height="9" rx="1.4"/><rect x="3" y="16" width="7" height="5" rx="1.4"/></>,
    products: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    analytics: <><path d="M3 20h18M6 16v-5M11 16V7M16 16V4M21 16v-9"/></>,
    materials: <><path d="M9 3h6M10 3v6l-6 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-9V3M8 15h8"/></>,
    receipts: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></>,
    consumption: <><path d="M12 21V9m-5 5 5-5 5 5M4 3h16v3H4z"/></>,
    lots: <><path d="m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5v1"/></>,
    settings: <><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.7 5.7l1.4 1.4m9.8 9.8 1.4 1.4m0-12.6-1.4 1.4m-9.8 9.8-1.4 1.4"/><circle cx="12" cy="12" r="4"/></>,
    quarantine: <><path d="m12 2 8 4v6c0 5-3.2 8-8 10-4.8-2-8-5-8-10V6l8-4Z"/><path d="M12 7v6m0 3v.5"/></>,
    alerts: <><path d="M10 3.5a2 2 0 0 1 4 0c3 .8 5 3.2 5 6.5v5l2 3H3l2-3v-5c0-3.3 2-5.7 5-6.5ZM10 21h4"/></>,
    audit: <><path d="M7 3h8l4 4v14H5V3h2Zm8 0v5h4M8 12h8M8 16h7"/></>,
    migration: <><path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3M3 5h5M3 9h5"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    logout: <><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M13 7l5 5-5 5M18 12H9"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const colouredNavIcons: Record<Exclude<IconName, "menu" | "close" | "logout" | "chevron">, string> = {
  dashboard: "📊",
  products: "🧾",
  analytics: "📈",
  materials: "🧪",
  receipts: "📥",
  consumption: "🚚",
  lots: "📦",
  users: "👤",
  settings: "⚙️",
  quarantine: "📦",
  alerts: "🚨",
  audit: "📑",
  migration: "📥",
};

function savedCollapsed(): boolean {
  try { return localStorage.getItem("stkflo-sidebar-collapsed") === "true"; }
  catch { return false; }
}

const Sidebar: React.FC<Props> = ({ me, view, setView, isAdmin, canViewAudit, canViewProducts, alertsCounts, onLogout }) => {
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [mobileOpen]);

  const hide = () => {
    setMobileOpen(false);
    setCollapsed(true);
    try { localStorage.setItem("stkflo-sidebar-collapsed", "true"); } catch { /* storage may be disabled */ }
  };
  const reveal = () => {
    setCollapsed(false);
    setMobileOpen(true);
    try { localStorage.setItem("stkflo-sidebar-collapsed", "false"); } catch { /* storage may be disabled */ }
  };
  const navigate = (destination: ViewMode) => {
    setView(destination);
    setMobileOpen(false);
  };

  const item = (destination: ViewMode, label: string, icon: keyof typeof colouredNavIcons, opts: { badge?: string | number; disabled?: boolean; title?: string } = {}) => (
    <li className="stkflo-nav-item" key={destination}>
      <button
        type="button"
        className={"stkflo-nav-link" + (view === destination ? " active" : "")}
        onClick={() => navigate(destination)}
        disabled={!me || opts.disabled}
        aria-current={view === destination ? "page" : undefined}
        title={opts.title || label}
      >
        <span className="stkflo-nav-icon stkflo-nav-icon-colour" aria-hidden="true">{colouredNavIcons[icon]}</span>
        <span className="stkflo-nav-label">{label}</span>
        {opts.badge !== undefined && <span className="stkflo-nav-badge">{opts.badge}</span>}
        <span className="stkflo-nav-chevron"><Icon name="chevron" size={13} /></span>
      </button>
    </li>
  );

  return (
    <>
      <button
        className={"stkflo-menu-trigger" + (collapsed ? " is-visible" : "") + (mobileOpen ? " is-open" : "")}
        type="button"
        aria-label="Open navigation menu"
        title="Open menu"
        aria-expanded={mobileOpen}
        onClick={reveal}
      ><Icon name="menu" size={22} /></button>
      {mobileOpen && <button className="stkflo-sidebar-scrim" type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" />}
      <aside className={"sidebar stkflo-sidebar" + (collapsed ? " is-collapsed" : "") + (mobileOpen ? " is-mobile-open" : "")} aria-label="Primary navigation">
        <div className="stkflo-sidebar-top">
          <div className="stkflo-sidebar-brand">
            <img src="/branding/stkflo-compact.svg" alt="StkFlo — One platform. Greater control." width="194" height="60" />
          </div>
          <button className="stkflo-sidebar-collapse" type="button" onClick={hide} aria-label="Collapse menu" title="Collapse navigation">
            <Icon name="close" size={19} />
          </button>
        </div>

        <nav className="stkflo-sidebar-navigation" aria-label="StkFlo sections">
          <div className="sidebar-section-label">Workspace</div>
          <ul className="nav-list">
            {item("dashboard", "Dashboard", "dashboard", { badge: "Today" })}
            {canViewProducts && item("products", "Product List", "products")}
            {item("analytics", "Analytics", "analytics")}
            {item("materials", "Materials Library", "materials")}
            {item("receipts", "Goods Receipts", "receipts")}
            {item("consumption", "Consumption", "consumption")}
            {item("lots", "Live Lots", "lots")}
          </ul>
          {isAdmin && <>
            <div className="sidebar-section-label sidebar-section-label-admin">Admin</div>
            <ul className="nav-list">
              {item("admin", "Users & Roles", "users")}
              {item("admin-settings", "Settings", "settings")}
              {item("admin-migration", "Data Migration", "migration")}
            </ul>
          </>}
          <div className="sidebar-section-label">Risk &amp; Quality</div>
          <ul className="nav-list">
            {item("quarantine", "Quarantine", "quarantine")}
            {item("alerts", "Low Stock & Expiry", "alerts", alertsCounts.total > 0 ? { badge: alertsCounts.total } : {})}
            {item("audit", "Audit Trail", "audit", { disabled: !canViewAudit, title: !canViewAudit ? "You do not have audit.view permission" : undefined })}
          </ul>
        </nav>

        <footer className="stkflo-sidebar-footer">
          {me ? <>
            <div className="stkflo-user-avatar" aria-hidden="true">{me.username.slice(0, 2).toUpperCase()}</div>
            <div className="stkflo-user-details">
              <strong title={me.username}>{me.username}</strong>
              <span title={me.role}>{me.role}</span>
            </div>
            <button className="stkflo-sidebar-logout" type="button" onClick={onLogout} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={18}/>
            </button>
          </> : <span>Please sign in.</span>}
          <div className="stkflo-sidebar-footnote"><span className="stkflo-online-indicator" /> GMP Mode <span>·</span> Pilot · On-prem</div>
        </footer>
      </aside>
    </>
  );
};

export default Sidebar;
