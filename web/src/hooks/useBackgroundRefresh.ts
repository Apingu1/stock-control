import { useCallback, useEffect, useRef } from "react";

type BackgroundRefreshOptions = {
  enabled?: boolean;
  intervalMs: number;
  hiddenIntervalMs?: number;
  label?: string;
};

export function useBackgroundRefresh(
  refresh: () => Promise<void> | void,
  {
    enabled = true,
    intervalMs,
    hiddenIntervalMs = 60_000,
    label = "background refresh",
  }: BackgroundRefreshOptions
) {
  const refreshRef = useRef(refresh);
  const inFlightRef = useRef(false);
  const lastStartedAtRef = useRef(0);

  refreshRef.current = refresh;

  const refreshNow = useCallback(async () => {
    if (!enabled || document.visibilityState === "hidden" || inFlightRef.current) return;

    const now = Date.now();
    if (now - lastStartedAtRef.current < 500) return;

    inFlightRef.current = true;
    lastStartedAtRef.current = now;
    try {
      await refreshRef.current();
    } catch (error) {
      console.warn(`${label} failed (non-fatal):`, error);
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled, label]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let stopped = false;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      if (stopped) return;
      clearTimer();
      const delay =
        document.visibilityState === "hidden"
          ? Math.max(hiddenIntervalMs, intervalMs)
          : intervalMs;
      timer = window.setTimeout(async () => {
        await refreshNow();
        schedule();
      }, delay);
    };

    const onFocus = () => {
      if (document.visibilityState !== "hidden") void refreshNow();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshNow();
      schedule();
    };

    schedule();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      clearTimer();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, hiddenIntervalMs, intervalMs, refreshNow]);

  return { refreshNow };
}
