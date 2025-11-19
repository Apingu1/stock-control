// src/components/dashboard/DashboardView.tsx

import React from "react";
import type { Material } from "../../types";

type DashboardViewProps = {
  materials: Material[];
};

const DashboardView: React.FC<DashboardViewProps> = ({ materials }) => {
  return (
    <section className="content">
      <div className="grid-top">
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Today’s Stock Posture</div>
              <div className="card-subtitle">
                Snapshot • Phase-1 Stock Control (demo)
              </div>
            </div>
            <div className="card-actions">
              <span className="pill">⏱ Auto-refresh 5 min</span>
              <span className="pill pill-accent">⚡ Scan mode ready</span>
            </div>
          </div>

          {/* METRICS */}
          <div className="metrics-row">
            <div className="metric-card accent-1">
              <div className="metric-label">
                Total live materials
                <span className="metric-chip">incl. APIs &amp; Excipients</span>
              </div>
              <div className="metric-value">
                {materials.length}{" "}
                <span style={{ fontSize: "11px", color: "#facc15" }}>
                  SKUs
                </span>
              </div>
              <div className="metric-trend">▲ +6 new in last 7 days</div>
              <div className="mini-spark">Σ</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">
                Batches ≤ 30 days to expiry
              </div>
              <div className="metric-value">
                23{" "}
                <span style={{ fontSize: "11px", color: "#fecaca" }}>
                  batches
                </span>
              </div>
              <div className="metric-trend danger">
                ● Review with QA this week
              </div>
              <div className="mini-spark">30d</div>
            </div>

            <div className="metric-card accent-2">
              <div className="metric-label">
                Quarantine stock
                <span className="metric-chip">OOS / Hold</span>
              </div>
              <div className="metric-value">
                7{" "}
                <span style={{ fontSize: "11px", color: "#e5e7eb" }}>
                  lots
                </span>
              </div>
              <div className="metric-trend">▼ −2 released this week</div>
              <div className="mini-spark">Q</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Book value on hand</div>
              <div className="metric-value">
                £426k{" "}
                <span style={{ fontSize: "11px", color: "#a5b4fc" }}>
                  across all sites
                </span>
              </div>
              <div className="metric-trend">▲ +£38k since month-start</div>
              <div className="mini-spark">£</div>
            </div>
          </div>

          {/* LOWER GRID – alerts + stock by location */}
          <div className="grid-sub">
            {/* Alerts */}
            <div>
              <div
                className="card-title"
                style={{ fontSize: "13px", marginBottom: 6 }}
              >
                Critical expiry &amp; low-stock alerts
              </div>
              <ul className="alert-list">
                <li className="alert-item">
                  <div>
                    <div className="alert-name">
                      <span className="dot-danger" />
                      Allopurinol API
                    </div>
                    <div className="alert-meta">
                      MAT0003 • SMS Life Sciences
                    </div>
                  </div>
                  <div>
                    <div className="alert-meta">Expires in</div>
                    <strong>7 days</strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="alert-meta">On hand</div>
                    <span className="alert-pill">
                      1.2 kg{" "}
                      <span style={{ color: "#fecaca" }}>Low</span>
                    </span>
                  </div>
                </li>
                <li className="alert-item">
                  <div>
                    <div className="alert-name">
                      <span className="dot-warning" />
                      Hydroxyzine 25 mg tabs
                    </div>
                    <div className="alert-meta">MAT0403 • Zentiva</div>
                  </div>
                  <div>
                    <div className="alert-meta">Used in</div>
                    <strong>ES174424</strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="alert-meta">Remaining</div>
                    <span className="alert-pill">
                      244 tabs{" "}
                      <span style={{ color: "#bbf7d0" }}>OK</span>
                    </span>
                  </div>
                </li>
                <li className="alert-item">
                  <div>
                    <div className="alert-name">
                      <span className="dot-warning" />
                      Sodium Benzoate
                    </div>
                    <div className="alert-meta">SB-ES-07 • Excipient</div>
                  </div>
                  <div>
                    <div className="alert-meta">Next due</div>
                    <strong>15 Jan 27</strong>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="alert-meta">QC Status</div>
                    <span className="alert-pill">Due in 2 days</span>
                  </div>
                </li>
              </ul>
            </div>

            {/* Locations */}
            <div>
              <div
                className="card-title"
                style={{ fontSize: "13px", marginBottom: 6 }}
              >
                Stock by location
              </div>
              <div className="chip-row">
                <span className="chip-filter active">Main Store</span>
                <span className="chip-filter">
                  Weigh &amp; Dispense
                </span>
                <span className="chip-filter">Quarantine</span>
                <span className="chip-filter">Released Only</span>
              </div>
              <div className="location-grid">
                <div className="location-card">
                  <div className="location-name">
                    ES-MS-01 • Main Store
                  </div>
                  <div className="location-meta">
                    <span>76 lots</span>
                    <span>£284k</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={
                        { "--value": "78%" } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
                <div className="location-card">
                  <div className="location-name">
                    ES-WD-01 • Weigh &amp; Dispense
                  </div>
                  <div className="location-meta">
                    <span>19 lots</span>
                    <span>£42k</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={
                        { "--value": "48%" } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
                <div className="location-card">
                  <div className="location-name">
                    ES-QC-01 • Quarantine
                  </div>
                  <div className="location-meta">
                    <span>7 lots</span>
                    <span>£18k</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={
                        { "--value": "64%" } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
};

export default DashboardView;
