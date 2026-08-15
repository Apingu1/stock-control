import { useEffect, useRef } from "react";
import {
  fetchSessionSettings,
  LAST_ACTIVITY_KEY,
  recordHumanActivity,
} from "../utils/api";

type IdleLogoutOptions = {
  enabled: boolean;
  onTimeout: (timeoutMinutes: number) => void;
};

const DEFAULT_TIMEOUT_MINUTES = 15;
const HEARTBEAT_INTERVAL_MS = 20_000;
const SETTINGS_REFRESH_MS = 60_000;

export function useIdleLogout({ enabled, onTimeout }: IdleLogoutOptions) {
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let logoutTimer: number | null = null;
    let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
    let lastHeartbeatAt = 0;

    const storedActivity = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY));
    let lastActivityAt = Number.isFinite(storedActivity) && storedActivity > 0
      ? storedActivity
      : Date.now();
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivityAt));

    const clearLogoutTimer = () => {
      if (logoutTimer !== null) {
        window.clearTimeout(logoutTimer);
        logoutTimer = null;
      }
    };

    const hasExpired = (now = Date.now()) =>
      now - lastActivityAt >= timeoutMinutes * 60_000;

    const expire = () => {
      if (stopped) return;
      stopped = true;
      clearLogoutTimer();
      onTimeoutRef.current(timeoutMinutes);
    };

    const scheduleLogout = () => {
      clearLogoutTimer();
      if (hasExpired()) {
        expire();
        return;
      }
      const remaining = Math.max(250, timeoutMinutes * 60_000 - (Date.now() - lastActivityAt));
      logoutTimer = window.setTimeout(expire, remaining);
    };

    const markHumanActivity = () => {
      if (stopped) return;
      const now = Date.now();
      if (hasExpired(now)) {
        expire();
        return;
      }

      lastActivityAt = now;
      sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      scheduleLogout();

      if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatAt = now;
        void recordHumanActivity().catch(() => {
          // apiFetch dispatches the global authentication-expired event for 401s.
        });
      }
    };

    const refreshSettings = async () => {
      try {
        const settings = await fetchSessionSettings();
        if (stopped) return;
        const next = Number(settings.inactivity_timeout_minutes);
        if (Number.isFinite(next) && next >= 5 && next <= 120) {
          timeoutMinutes = next;
        }
        scheduleLogout();
      } catch {
        // Keep the last known/default timeout. Authentication failures are
        // handled centrally by apiFetch and App.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") markHumanActivity();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "wheel",
    ];
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markHumanActivity, { passive: true });
    }
    window.addEventListener("focus", markHumanActivity);
    document.addEventListener("visibilitychange", onVisibilityChange);

    scheduleLogout();
    void refreshSettings();
    const settingsTimer = window.setInterval(() => {
      void refreshSettings();
    }, SETTINGS_REFRESH_MS);

    return () => {
      stopped = true;
      clearLogoutTimer();
      window.clearInterval(settingsTimer);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markHumanActivity);
      }
      window.removeEventListener("focus", markHumanActivity);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled]);
}
