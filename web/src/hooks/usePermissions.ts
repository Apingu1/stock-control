import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "../utils/api";

type MyPermissionsResponse = {
  role: string;
  permissions: string[];
};

/**
 * Client-side permission state (UX only).
 * Server remains authoritative for enforcement.
 */
export function usePermissions() {
  const [myPermissions, setMyPermissions] = useState<string[]>([]);

  const hasPerm = useMemo(() => {
    const s = new Set(myPermissions);
    return (p: string) => s.has(p);
  }, [myPermissions]);

  const loadMyPermissions = useCallback(async () => {
    try {
      const res = await apiFetch("/auth/my-permissions");
      const data = (await res.json()) as MyPermissionsResponse;
      setMyPermissions(data.permissions || []);
    } catch (e) {
      console.error(e);
      setMyPermissions([]);
    }
  }, []);

  return {
    myPermissions,
    setMyPermissions,
    hasPerm,
    loadMyPermissions,
  };
}
