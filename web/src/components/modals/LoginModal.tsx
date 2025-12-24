import React, { useEffect, useState } from "react";
import { fetchMe, login } from "../../utils/api";
import type { UserMe } from "../../types";

export default function LoginModal({
  open,
  onLoggedIn,
}: {
  open: boolean;
  onLoggedIn: (me: UserMe) => void;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await login(username.trim(), password);
      const me = await fetchMe();
      onLoggedIn(me);
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Sign in</div>
            <div className="modal-subtitle">
              Please sign in to access the Stock Control system.
            </div>
          </div>
        </div>

        <form className="modal-body" onSubmit={handleLogin}>
          <div className="form-grid">
            <div className="form-group">
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <div className="error-row">{error}</div>}

          <div className="modal-footer">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
