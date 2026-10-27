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
  const [videoPlaying, setVideoPlaying] = useState(false);

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
    <main className="stkflo-login">
      <div className="stkflo-login-glow stkflo-login-glow-one" aria-hidden="true" />
      <div className="stkflo-login-glow stkflo-login-glow-two" aria-hidden="true" />
      <div className="stkflo-login-wave" aria-hidden="true" />
      <div className="stkflo-login-shell">
        <section className="stkflo-login-media" aria-label="About StkFlo">
          {/* Keep the square video intact, with the original StkFlo slogans underneath. */}
          <div className="stkflo-login-video-stage">
            <img
              className="stkflo-login-video-poster"
              src="/branding/stkflo-login-poster.webp"
              alt="StkFlo"
              width="944"
              height="944"
            />
            <video
              className={"stkflo-login-video" + (videoPlaying ? " is-playing" : "")}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/branding/stkflo-login-poster.webp"
              aria-hidden="true"
              onPlaying={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onError={() => setVideoPlaying(false)}
            >
              <source src="/branding/stkflo-login-loop.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="stkflo-login-media-copy">
            <span className="stkflo-login-eyebrow"><span /> CONNECTED OPERATIONS</span>
            <h1>Clarity across <em>every movement.</em></h1>
            <p>A unified workspace for materials, traceability and confident inventory control.</p>
            <div className="stkflo-login-story-rule" aria-hidden="true" />
            <span className="stkflo-login-story-signoff">ONE PLATFORM. GREATER CONTROL.</span>
          </div>
          <div className="stkflo-login-media-footer">StkFlo <span>·</span> Secure on-premises workspace</div>
        </section>

        <section className="stkflo-login-panel" aria-label="Sign in to StkFlo">
          <div className="stkflo-login-panel-top">
            <div className="stkflo-login-symbol">
              <img src="/branding/stkflo-monogram.svg" alt="StkFlo SF monogram" width="110" height="168" />
            </div>
            <span className="stkflo-login-panel-kicker">SECURE ACCESS</span>
            {changingPassword && <h2>Set your password</h2>}
            <p>
              {changingPassword
                ? "Your administrator issued a temporary password. Create your personal password to continue."
                : "Sign in to access your secure StkFlo workspace."}
            </p>
          </div>
          <form className="stkflo-login-form" onSubmit={changingPassword ? handlePasswordChange : handleLogin}>
            {!changingPassword ? (
              <>
                <div className="stkflo-login-field">
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
                <div className="stkflo-login-field">
                  <label htmlFor="stock-control-password">Password</label>
                  <div className="stkflo-password-wrap">
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
                      className="stkflo-password-toggle"
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
                <div className="stkflo-login-field">
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
                <div className="stkflo-login-field">
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
                <p className="stkflo-login-password-note">Minimum 8 characters.</p>
              </>
            )}
            {(message || error) && (
              <div className={error ? "stkflo-login-notice is-error" : "stkflo-login-notice"} role={error ? "alert" : "status"}>
                {error || message}
              </div>
            )}
            <button className="stkflo-login-submit" type="submit" disabled={busy}>
              {busy
                ? changingPassword ? "Saving password…" : "Signing in…"
                : changingPassword ? "Save password and continue" : "Sign in to StkFlo"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="stkflo-login-panel-footer">
            <span className="stkflo-login-lock" aria-hidden="true">◆</span>
            Authorised access only <span>·</span> Protected session
          </div>
        </section>
      </div>
    </main>
  );
}
