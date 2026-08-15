import React, { useEffect, useState } from "react";
import { changePassword, fetchMe, login } from "../../utils/api";
import type { UserMe } from "../../types";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function LoginModal({
  open,
  message,
  onLoggedIn,
}: {
  open: boolean;
  message?: string | null;
  onLoggedIn: (me: UserMe) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername("");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangingPassword(false);
    setError(null);
    setBusy(false);
  }, [open, message]);

  if (!open) return null;

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await login(username.trim(), password);
      setPassword("");
      if (result.must_change_password) {
        setChangingPassword(true);
        return;
      }
      const me = await fetchMe();
      onLoggedIn(me);
    } catch (error: unknown) {
      setPassword("");
      setError(errorMessage(error, "Login failed"));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await changePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      const me = await fetchMe();
      onLoggedIn(me);
    } catch (error: unknown) {
      setError(errorMessage(error, "Password change failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {changingPassword ? "Create your private password" : "Sign in"}
            </div>
            <div className="modal-subtitle">
              {changingPassword
                ? "The password supplied by your administrator is temporary. Create a new password before continuing."
                : "Please sign in to access the Stock Control system."}
            </div>
          </div>
        </div>

        <form
          className="modal-body"
          onSubmit={changingPassword ? handlePasswordChange : handleLogin}
        >
          {!changingPassword ? (
            <div className="form-grid">
              <div className="form-group">
                <label className="label" htmlFor="stock-control-username">Username</label>
                <input
                  id="stock-control-username"
                  className="input"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="label" htmlFor="stock-control-password">Password</label>
                <input
                  id="stock-control-password"
                  className="input"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <div className="form-group">
                <label className="label" htmlFor="stock-control-new-password">New password</label>
                <input
                  id="stock-control-new-password"
                  className="input"
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="label" htmlFor="stock-control-confirm-password">
                  Confirm new password
                </label>
                <input
                  id="stock-control-confirm-password"
                  className="input"
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <div className="content-subtitle">Minimum 8 characters.</div>
            </div>
          )}

          {(message || error) && <div className={error ? "error-row" : "info-row"}>{error || message}</div>}

          <div className="modal-footer">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy
                ? changingPassword
                  ? "Saving password…"
                  : "Signing in…"
                : changingPassword
                  ? "Save password and continue"
                  : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
