import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api";
import type { Role } from "../../types";

type AdminUserRow = {
  id: number;
  username: string;
  role: Role;
  is_active: boolean;
};

const ROLE_OPTIONS: Role[] = ["OPERATOR", "SENIOR", "ADMIN"];

export default function AdminUsersView() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // create form
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("OPERATOR");
  const [newActive, setNewActive] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch("/admin/users");
      const data = (await res.json()) as AdminUserRow[];
      setUsers(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

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
      setNewRole("OPERATOR");
      setNewActive(true);

      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const updateUser = async (id: number, patch: Partial<Pick<AdminUserRow, "role" | "is_active">>) => {
    setErr(null);
    try {
      await apiFetch(`/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update user");
    }
  };

  const sorted = useMemo(() => [...users].sort((a, b) => a.username.localeCompare(b.username)), [users]);

  return (
    <section className="content">
      <section className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Admin — Users</div>
            <div className="card-subtitle">Create users, assign roles, and activate/deactivate access.</div>
          </div>
          <div className="card-actions">
            <button className="btn" onClick={load} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        <div className="card-body">
          {err && <div className="error-row">{err}</div>}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <div>
                <div className="card-title">Create user</div>
                <div className="card-subtitle">Passwords are stored hashed server-side.</div>
              </div>
            </div>

            <div className="card-body">
              <div className="form-grid">
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
                    {ROLE_OPTIONS.map((r) => (
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

              <button className="btn btn-primary" onClick={createUser} disabled={creating}>
                {creating ? "Creating…" : "Create user"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="info-row">Loading users…</div>
          ) : (
            <div className="table-wrapper" style={{ maxHeight: 520, overflowY: "auto" }}>
              <table className="table">
                <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#050816" }}>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Active</th>
                    <th style={{ width: 220 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((u) => (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>
                        <select
                          className="input"
                          value={u.role}
                          onChange={(e) => updateUser(u.id, { role: e.target.value as Role })}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{u.is_active ? "Yes" : "No"}</td>
                      <td>
                        <button className="btn" onClick={() => updateUser(u.id, { is_active: !u.is_active })}>
                          {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-row">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
