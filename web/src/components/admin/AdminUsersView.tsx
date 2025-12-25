import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import type { AdminRole, PermissionDef, Role, RolePermissionRow } from "../../types";

type AdminUserRow = {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
};

type Tab = "users" | "roles";

const FALLBACK_ROLES: Role[] = ["OPERATOR", "SENIOR", "ADMIN"];

function groupForPermissionKey(key: string): string {
  if (key.startsWith("materials.")) return "Materials";
  if (key.startsWith("receipts.")) return "Goods Receipts";
  if (key.startsWith("issues.")) return "Consumption";
  if (key.startsWith("lots.")) return "Live Lots";
  if (key.startsWith("admin.")) return "Admin";
  return "Other";
}

export default function AdminUsersView() {
  const [tab, setTab] = useState<Tab>("users");

  // shared state
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Users
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>(FALLBACK_ROLES);

  // create user form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("OPERATOR");
  const [newActive, setNewActive] = useState(true);
  const [creating, setCreating] = useState(false);

  // Roles & permissions
  const [adminRoles, setAdminRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<PermissionDef[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("ADMIN");
  const [rolePerms, setRolePerms] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  // create role
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");

  const loadUsers = async () => {
    const res = await apiFetch("/admin/users");
    const data = (await res.json()) as AdminUserRow[];
    setUsers(data);
  };

  const loadRoles = async () => {
    // If backend supports it, use it; otherwise fallback.
    try {
      const res = await apiFetch("/admin/roles");
      const data = (await res.json()) as AdminRole[];
      setAdminRoles(data);
      const names = data.map((r) => r.name).filter(Boolean);
      setRoles(names.length ? names : FALLBACK_ROLES);

      // keep selected role sane
      if (names.length && !names.includes(selectedRole)) setSelectedRole(names[0]);
    } catch {
      setAdminRoles(FALLBACK_ROLES.map((n) => ({ name: n })));
      setRoles(FALLBACK_ROLES);
    }
  };

  const loadPermissionDefs = async () => {
    try {
      const res = await apiFetch("/admin/permissions");
      const data = (await res.json()) as PermissionDef[];
      setPermissions(data);
    } catch {
      // fallback to your known list if endpoint not present
      setPermissions([
        { key: "materials.view" },
        { key: "materials.create" },
        { key: "materials.edit" },
        { key: "materials.delete" },
        { key: "receipts.view" },
        { key: "receipts.create" },
        { key: "receipts.edit" },
        { key: "receipts.delete" },
        { key: "issues.view" },
        { key: "issues.create" },
        { key: "issues.edit" },
        { key: "issues.delete" },
        { key: "lots.view" },
        { key: "lots.status_change" },
        { key: "admin.full" },
      ]);
    }
  };

  const loadRolePermissions = async (role: string) => {
    setRolePerms({});
    setErr(null);

    // Preferred endpoint: /admin/roles/{role}/permissions
    // We accept a few shapes so it won’t break if backend differs slightly.
    try {
      const res = await apiFetch(`/admin/roles/${encodeURIComponent(role)}/permissions`);
      const data = (await res.json()) as any;

      // shape A: { role: "X", permissions: [{permission_key, granted}] }
      if (data?.permissions && Array.isArray(data.permissions)) {
        const map: Record<string, boolean> = {};
        for (const row of data.permissions as RolePermissionRow[]) {
          map[row.permission_key] = !!row.granted;
        }
        setRolePerms(map);
        return;
      }

      // shape B: [{permission_key, granted}, ...]
      if (Array.isArray(data)) {
        const map: Record<string, boolean> = {};
        for (const row of data as RolePermissionRow[]) {
          map[row.permission_key] = !!row.granted;
        }
        setRolePerms(map);
        return;
      }

      // shape C: { "materials.view": true, ... }
      if (data && typeof data === "object") {
        const map: Record<string, boolean> = {};
        for (const k of Object.keys(data)) map[k] = !!data[k];
        setRolePerms(map);
        return;
      }

      setRolePerms({});
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load role permissions");
      setRolePerms({});
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setErr(null);
    try {
      await Promise.all([loadUsers(), loadRoles(), loadPermissionDefs()]);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "roles") void loadRolePermissions(selectedRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedRole]);

  const createUser = async () => {
    if (!newUsername.trim()) return setErr("Username is required");
    if (!newPassword || newPassword.length < 6) return setErr("Password must be at least 6 characters");

    setCreating(true);
    setErr(null);
    try {
      await apiFetch("/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
          is_active: newActive,
        }),
      });

      setNewUsername("");
      setNewPassword("");
      setNewRole(roles[0] ?? "OPERATOR");
      setNewActive(true);

      await loadUsers();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const updateUser = async (id: number, patch: Partial<Pick<AdminUserRow, "role" | "is_active">> & { password?: string }) => {
    setErr(null);
    try {
      await apiFetch(`/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await loadUsers();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update user");
    }
  };

  const promptResetPassword = async (u: AdminUserRow) => {
    const pw = window.prompt(`Set a new password for "${u.username}" (min 6 chars):`);
    if (!pw) return;
    if (pw.length < 6) return setErr("Password must be at least 6 characters");
    await updateUser(u.id, { password: pw });
  };

  const createRole = async () => {
    const name = roleName.trim().toUpperCase();
    if (!name) return setErr("Role name is required");
    if (!/^[A-Z0-9_ -]+$/.test(name)) return setErr("Role name should be uppercase letters/numbers/spaces/_/- only");

    setErr(null);
    try {
      await apiFetch("/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: roleDesc.trim() || null, is_active: true }),
      });
      setRoleName("");
      setRoleDesc("");
      await loadRoles();
      setSelectedRole(name);
      setTab("roles");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create role");
    }
  };

  const togglePerm = (key: string) => {
    setRolePerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const savePermissions = async () => {
    setSavingPerms(true);
    setErr(null);

    // We send a clean, explicit payload the backend can easily consume:
    // { permissions: [{permission_key, granted}, ...] }
    const payload = {
      role: selectedRole,
      permissions: permissions.map((p) => ({
        permission_key: p.key,
        granted: !!rolePerms[p.key],
      })),
    };

    try {
      await apiFetch(`/admin/roles/${encodeURIComponent(selectedRole)}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadRolePermissions(selectedRole);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save permissions");
    } finally {
      setSavingPerms(false);
    }
  };

  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.username.localeCompare(b.username)), [users]);

  const groupedPerms = useMemo(() => {
    const groups: Record<string, PermissionDef[]> = {};
    for (const p of permissions) {
      const g = groupForPermissionKey(p.key);
      if (!groups[g]) groups[g] = [];
      groups[g].push(p);
    }
    // stable order within group
    for (const g of Object.keys(groups)) groups[g].sort((a, b) => a.key.localeCompare(b.key));
    return groups;
  }, [permissions]);

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Admin — Users & Roles</div>
            <div className="card-subtitle">Manage users, roles, and permissions (server enforced).</div>
          </div>

          <div className="card-actions" style={{ gap: 10 }}>
            <div className="chip" style={{ cursor: "pointer" }} onClick={() => setTab("users")}>
              {tab === "users" ? "✅" : "◻️"} Users
            </div>
            <div className="chip" style={{ cursor: "pointer" }} onClick={() => setTab("roles")}>
              {tab === "roles" ? "✅" : "◻️"} Roles & Permissions
            </div>
            <button className="btn" onClick={loadAll} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        <div className="card-body">
          {err && <div className="error-row">{err}</div>}

          {tab === "users" && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div>
                    <div className="card-title">Create user</div>
                    <div className="card-subtitle">Passwords are stored hashed server-side.</div>
                  </div>
                </div>

                <div className="card-body">
                  <div className="form-grid" style={{ alignItems: "end" }}>
                    <div className="form-group">
                      <label className="label">Username</label>
                      <input className="input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
                    </div>

                    <div className="form-group">
                      <label className="label">Password</label>
                      <input
                        className="input"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="label">Role</label>
                      <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="label">Active</label>
                      <select
                        className="input"
                        value={newActive ? "true" : "false"}
                        onChange={(e) => setNewActive(e.target.value === "true")}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                    <button className="btn btn-primary" onClick={createUser} disabled={creating}>
                      {creating ? "Creating…" : "Create user"}
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="info-row">Loading users…</div>
              ) : (
                <div className="table-wrapper" style={{ maxHeight: 520, overflow: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Active</th>
                        <th style={{ width: 240 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedUsers.map((u) => (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 600 }}>{u.username}</td>
                          <td>
                            <select
                              className="input"
                              style={{ maxWidth: 220 }}
                              value={u.role}
                              onChange={(e) => updateUser(u.id, { role: e.target.value })}
                            >
                              {roles.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              className="input"
                              style={{ maxWidth: 160 }}
                              value={u.is_active ? "true" : "false"}
                              onChange={(e) => updateUser(u.id, { is_active: e.target.value === "true" })}
                            >
                              <option value="true">Active</option>
                              <option value="false">Inactive</option>
                            </select>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                              <button className="btn" onClick={() => promptResetPassword(u)}>
                                Reset password
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!sortedUsers.length && (
                        <tr>
                          <td colSpan={4} style={{ color: "var(--text-secondary)" }}>
                            No users found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === "roles" && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div>
                    <div className="card-title">Create role</div>
                    <div className="card-subtitle">Roles are dynamic. Permissions are enforced server-side.</div>
                  </div>
                </div>
                <div className="card-body">
                  <div className="form-grid" style={{ alignItems: "end" }}>
                    <div className="form-group">
                      <label className="label">Role name</label>
                      <input
                        className="input"
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                        placeholder="e.g. QA_SUPERVISOR"
                      />
                    </div>

                    <div className="form-group">
                      <label className="label">Description</label>
                      <input
                        className="input"
                        value={roleDesc}
                        onChange={(e) => setRoleDesc(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>

                    <div className="form-group" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-primary" onClick={createRole}>
                        Create role
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div>
                    <div className="card-title">Permission matrix</div>
                    <div className="card-subtitle">Toggle permissions for a role and save.</div>
                  </div>
                </div>

                <div className="card-body">
                  <div className="form-grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                    <div className="form-group">
                      <label className="label">Select role</label>
                      <select className="input" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                        {(adminRoles.length ? adminRoles : roles.map((r) => ({ name: r }))).map((r) => (
                          <option key={r.name} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-primary" onClick={savePermissions} disabled={savingPerms}>
                        {savingPerms ? "Saving…" : "Save permissions"}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    {Object.keys(groupedPerms)
                      .sort((a, b) => a.localeCompare(b))
                      .map((group) => (
                        <div key={group} className="card" style={{ marginBottom: 12 }}>
                          <div className="card-header" style={{ marginBottom: 10 }}>
                            <div>
                              <div className="card-title" style={{ fontSize: 15 }}>
                                {group}
                              </div>
                              <div className="card-subtitle" style={{ fontSize: 12 }}>
                                {selectedRole}
                              </div>
                            </div>
                          </div>

                          <div className="card-body" style={{ paddingTop: 0 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                              {groupedPerms[group].map((p) => (
                                <label
                                  key={p.key}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    background: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  <span style={{ display: "flex", flexDirection: "column" }}>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.key}</span>
                                    {p.description && (
                                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{p.description}</span>
                                    )}
                                  </span>

                                  <input
                                    type="checkbox"
                                    checked={!!rolePerms[p.key]}
                                    onChange={() => togglePerm(p.key)}
                                    style={{ width: 18, height: 18 }}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
