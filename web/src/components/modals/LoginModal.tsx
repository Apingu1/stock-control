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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsername("");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setChangingPassword(false);
    setShowPassword(false);
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
    <main className="unison-login">
      <div className="unison-login-glow unison-login-glow-one" aria-hidden="true" />
      <div className="unison-login-glow unison-login-glow-two" aria-hidden="true" />
      <div className="unison-login-wave" aria-hidden="true" />
      <div className="unison-login-shell">
        <section className="unison-login-story" aria-label="About Unison">
          <div className="unison-login-story-logo">
            <img src="/branding/Unison_OptionF_Full_Logo.svg" alt="Unison — One platform. Greater control." width="420" height="140" />
          </div>
          <div className="unison-login-story-copy">
            <span className="unison-login-eyebrow"><span /> CONNECTED OPERATIONS</span>
            <h1>Clarity across <em>every movement.</em></h1>
            <p>A unified workspace for materials, traceability and confident inventory control.</p>
            <div className="unison-login-story-rule" />
            <span className="unison-login-story-signoff">ONE PLATFORM. GREATER CONTROL.</span>
          </div>
          <div className="unison-login-story-footer">Unison <span>·</span> Secure on-premises workspace</div>
        </section>

        <section className="unison-login-panel" aria-label="Sign in to Unison">
          <div className="unison-login-panel-top">
            <div className="unison-login-symbol">
              <img src="/branding/Unison_OptionF_Monogram.svg" alt="Unison symbol" width="110" height="110" />
            </div>
            <span className="unison-login-panel-kicker">WELCOME TO UNISON</span>
            <h2>{changingPassword ? "Set your password" : "Welcome back"}</h2>
            <p>
              {changingPassword
                ? "Your administrator issued a temporary password. Create your personal password to continue."
                : "Sign in to access your secure Unison workspace."}
            </p>
          </div>
          <form className="unison-login-form" onSubmit={changingPassword ? handlePasswordChange : handleLogin}>
            {!changingPassword ? (
              <>
                <div className="unison-login-field">
                  <label htmlFor="stock-control-username">Username</label>
                  <input
                    id="stock-control-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={busy}
                    autoFocus
                    required
                  />
                </div>
                <div className="unison-login-field">
                  <label htmlFor="stock-control-password">Password</label>
                  <div className="unison-password-wrap">
                    <input
                      id="stock-control-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={busy}
                      required
                    />
                    <button
                      className="unison-password-toggle"
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >{showPassword ? "Hide" : "Show"}</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="unison-login-field">
                  <label htmlFor="stock-control-new-password">New password</label>
                  <input
                    id="stock-control-new-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Create your new password"
                    disabled={busy}
                    minLength={8}
                    autoFocus
                    required
                  />
                </div>
                <div className="unison-login-field">
                  <label htmlFor="stock-control-confirm-password">Confirm new password</label>
                  <input
                    id="stock-control-confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    disabled={busy}
                    required
                  />
                </div>
                <p className="unison-login-password-note">Minimum 8 characters.</p>
              </>
            )}
            {(message || error) && (
              <div className={error ? "unison-login-notice is-error" : "unison-login-notice"} role={error ? "alert" : "status"}>
                {error || message}
              </div>
            )}
            <button className="unison-login-submit" type="submit" disabled={busy}>
              {busy
                ? changingPassword ? "Saving password…" : "Signing in…"
                : changingPassword ? "Save password and continue" : "Sign in to Unison"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="unison-login-panel-footer">
            <span className="unison-login-lock" aria-hidden="true">◆</span>
            Authorised access only <span>·</span> Protected session
          </div>
        </section>
      </div>
    </main>
  );
}
