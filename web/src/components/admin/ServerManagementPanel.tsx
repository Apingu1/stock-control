import { useEffect, useState } from "react";
import { apiFetch } from "../../utils/api";

type ManagementInfo = {
  host_manager_url?: string;
  vm_manager_url?: string;
};
type SystemInfo = {
  management?: ManagementInfo;
};

function trustedHttpsUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export default function ServerManagementPanel() {
  const [info, setInfo] = useState<ManagementInfo>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch("/admin/db-tools/system-info")
      .then(async (response) => (await response.json()) as SystemInfo)
      .then((data) => { if (active) setInfo(data.management || {}); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Management information unavailable");
      });
    return () => { active = false; };
  }, []);

  const links = [
    {
      label: "Hyper-V Host Manager",
      description: "See VM power state and start or gracefully shut down the Windows 11 VM.",
      href: trustedHttpsUrl(info.host_manager_url),
    },
    {
      label: "Windows VM Manager",
      description: "View Docker health, queue stack recovery and configure N: network backup replication.",
      href: trustedHttpsUrl(info.vm_manager_url),
    },
  ];

  return (
    <section className="card sf-phase4-backup-panel">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="card-title">Server Management &amp; Recovery</div>
          <div className="card-subtitle">
            Independent Windows administration endpoints, available even when the StkFlo Docker stack is stopped.
          </div>
        </div>
        <span className="pill">Authorised Windows operators only</span>
      </div>
      {error ? <p role="alert" style={{ color: "var(--danger, #dc7373)" }}>{error}</p> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginTop: 18 }}>
        {links.map((entry) => (
          <div key={entry.label} className="sf-phase4-backup-section" style={{ padding: 17, borderRadius: 12 }}>
            <div className="sf-settings-section-title">{entry.label}</div>
            <p style={{ fontSize: 13, lineHeight: 1.55, opacity: 0.8 }}>{entry.description}</p>
            {entry.href ? (
              <a className="btn primary" href={entry.href} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: "none", display: "inline-flex" }}>
                Open independent manager
              </a>
            ) : (
              <p style={{ fontSize: 13, opacity: 0.75 }}>
                Manager URL not configured. Install and configure this Windows agent through the deployment guide.
              </p>
            )}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, marginTop: 14, opacity: 0.75 }}>
        These controls use separate Windows credentials and TLS certificates. The physical host manager can recover a
        powered-off VM; the VM manager can recover Docker only while the Windows guest is operating. Neither can
        recover a powered-off physical host.
      </p>
    </section>
  );
}
