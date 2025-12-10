import React, { useMemo, useState } from "react";
import type { Material } from "../../types";
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_TYPE_OPTIONS,
} from "../../constants";

type MaterialsLibraryViewProps = {
  materials: Material[];
  onEditMaterial: (m: Material) => void;
};

const exportToCsv = (filename: string, rows: (string | number | null | undefined)[][]) => {
  const escapeCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return "";
    let s = String(cell);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const csvContent =
    rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const MaterialsLibraryView: React.FC<MaterialsLibraryViewProps> = ({
  materials,
  onEditMaterial,
}) => {
  const [materialsSearch, setMaterialsSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const libraryFilteredMaterials = useMemo(() => {
    const q = materialsSearch.trim().toLowerCase();

    return materials.filter((m) => {
      if (categoryFilter !== "ALL" && m.category_code !== categoryFilter) {
        return false;
      }
      if (typeFilter !== "ALL" && m.type_code !== typeFilter) {
        return false;
      }

      if (!q) return true;

      return (
        m.material_code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (m.manufacturer || "").toLowerCase().includes(q) ||
        (m.supplier || "").toLowerCase().includes(q)
      );
    });
  }, [materials, materialsSearch, categoryFilter, typeFilter]);

  const handleExport = () => {
    const header = [
      "Code",
      "Name",
      "Category",
      "Type",
      "Base UOM",
      "Manufacturer",
      "Supplier",
      "Status",
    ];

    const rows = libraryFilteredMaterials.map((m) => [
      m.material_code,
      m.name,
      m.category_code,
      m.type_code,
      m.base_uom_code,
      m.manufacturer || "",
      m.supplier || "",
      m.status,
    ]);

    exportToCsv("materials_library.csv", [header, ...rows]);
  };

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">ES Materials Library</div>
            <div className="card-subtitle">
              Master data for all raw materials, APIs and excipients used in
              ES Specials.
            </div>
          </div>
          <div className="card-actions">
            <select
              className="input"
              style={{ width: 180, marginRight: 8 }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All categories</option>
              {MATERIAL_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <select
              className="input"
              style={{ width: 160, marginRight: 8 }}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All types</option>
              {MATERIAL_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>

            <input
              className="input"
              style={{ width: 260, marginRight: 8 }}
              placeholder="Search by code, name, supplier, manufacturer…"
              value={materialsSearch}
              onChange={(e) => setMaterialsSearch(e.target.value)}
            />

            <button className="btn" onClick={handleExport}>
              Export CSV
            </button>
          </div>
        </div>

        <div
          className="table-wrapper"
          style={{ maxHeight: 480, overflowY: "auto" }}
        >
          <table className="table">
            <thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                background: "#050816",
              }}
            >
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Base UOM</th>
                <th>Manufacturer</th>
                <th>Supplier</th>
                <th>Status</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {libraryFilteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-row">
                    No materials found.
                  </td>
                </tr>
              )}
              {libraryFilteredMaterials.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.material_code}</strong>
                  </td>
                  <td>{m.name}</td>
                  <td>{m.category_code}</td>
                  <td>{m.type_code}</td>
                  <td>{m.base_uom_code}</td>
                  <td>{m.manufacturer || "—"}</td>
                  <td>{m.supplier || "—"}</td>
                  <td>
                    <span
                      className={
                        m.status === "ACTIVE"
                          ? "tag tag-success"
                          : m.status === "OBSOLETE"
                          ? "tag tag-warning"
                          : "tag tag-muted"
                      }
                    >
                      {m.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onEditMaterial(m)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
};

export default MaterialsLibraryView;
