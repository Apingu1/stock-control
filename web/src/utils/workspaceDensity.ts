/**
 * Display density is a DEVICE-local visual preference. "auto" responds to
 * the available viewport; we never change browser zoom or stock data.
 */
export type WorkspaceDensity = "auto" | "compact" | "comfortable";
export const DENSITY_STORAGE_KEY = "stkflo.workspace.density.v1";
export const DEFAULT_DENSITY: WorkspaceDensity = "auto";

export function isWorkspaceDensity(value: unknown): value is WorkspaceDensity {
  return value === "auto" || value === "compact" || value === "comfortable";
}

export function readDensityPreference(): WorkspaceDensity {
  try {
    const saved = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    return isWorkspaceDensity(saved) ? saved : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function saveDensityPreference(value: WorkspaceDensity): void {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, value);
  } catch {
    // Private browsing/storage denial must never block the UI.
  }
}
