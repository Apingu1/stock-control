import { useCallback, useEffect, useState } from "react";
import type { UserMe } from "../types";
import { clearToken, fetchMe, getToken } from "../utils/api";

/**
 * App-level auth bootstrap & session UX state.
 *
 * Keeps behaviour identical to the previous inline App.tsx logic:
 * - If no token: show login
 * - If token but /auth/me fails: clear token + show login
 */
export function useAuth() {
  const [me, setMe] = useState<UserMe | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const bootstrap = useCallback(
    async (opts: {
      onAuthed: (u: UserMe) => Promise<void>;
      onUnauthed: () => Promise<void> | void;
    }) => {
      const token = getToken();
      if (!token) {
        setMe(null);
        setAuthChecked(true);
        setShowLogin(true);
        await opts.onUnauthed();
        return;
      }

      try {
        const u = await fetchMe();
        setMe(u);
        setAuthChecked(true);
        setShowLogin(false);
        await opts.onAuthed(u);
      } catch {
        clearToken();
        setMe(null);
        setAuthChecked(true);
        setShowLogin(true);
        await opts.onUnauthed();
      }
    },
    []
  );

  const handleLoggedIn = useCallback(async (u: UserMe, after: () => Promise<void>) => {
    setMe(u);
    setShowLogin(false);
    await after();
  }, []);

  const logout = useCallback((opts: { onLoggedOut: () => void }) => {
    clearToken();
    setMe(null);
    setShowLogin(true);
    opts.onLoggedOut();
  }, []);

  // Placeholder effect (keeps hook future-proof if we need mount side-effects later)
  useEffect(() => {
    // no-op
  }, []);

  return {
    me,
    setMe,
    authChecked,
    setAuthChecked,
    showLogin,
    setShowLogin,
    bootstrap,
    handleLoggedIn,
    logout,
  };
}
