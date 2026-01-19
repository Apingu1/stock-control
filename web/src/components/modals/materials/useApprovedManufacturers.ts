import { useCallback, useMemo, useState } from "react";
import type { ApprovedManufacturer } from "../../../types";
import { apiFetch } from "../../../utils/api";
import { normalize } from "./materialFormUtils";

export function useApprovedManufacturers() {
  const [approvedManufacturers, setApprovedManufacturers] = useState<ApprovedManufacturer[]>([]);
  const [newApprovedName, setNewApprovedName] = useState("");
  const [loadingApproved, setLoadingApproved] = useState(false);
  const [approvedError, setApprovedError] = useState<string | null>(null);

  // stage changes until Save
  const [pendingRemoveIds, setPendingRemoveIds] = useState<Set<number>>(new Set());
  const [pendingAddNames, setPendingAddNames] = useState<string[]>([]);

  const approvedVisible = useMemo(() => {
    return approvedManufacturers.slice().sort((a, b) =>
      a.manufacturer_name.localeCompare(b.manufacturer_name)
    );
  }, [approvedManufacturers]);

  const pendingAddsNormalized = useMemo(() => {
    return new Set(pendingAddNames.map(normalize));
  }, [pendingAddNames]);

  const resetStaging = useCallback(() => {
    setPendingRemoveIds(new Set());
    setPendingAddNames([]);
    setApprovedError(null);
  }, []);

  const resetAll = useCallback(() => {
    setApprovedManufacturers([]);
    setNewApprovedName("");
    setLoadingApproved(false);
    setApprovedError(null);
    setPendingRemoveIds(new Set());
    setPendingAddNames([]);
  }, []);

  const loadApproved = useCallback(async (code: string) => {
    try {
      setApprovedError(null);
      setLoadingApproved(true);
      const res = await apiFetch(
        `/materials/${encodeURIComponent(code)}/approved-manufacturers`
      );
      const data = (await res.json()) as ApprovedManufacturer[];
      setApprovedManufacturers(data);
    } catch (err: any) {
      console.error(err);
      setApprovedError(err.message ?? "Failed to load approved manufacturers");
      setApprovedManufacturers([]);
    } finally {
      setLoadingApproved(false);
    }
  }, []);

  const stageDelete = useCallback((id: number) => {
    setApprovedError(null);
    setPendingRemoveIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const undoDelete = useCallback((id: number) => {
    setPendingRemoveIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const removePendingAdd = useCallback((nameToRemove: string) => {
    const n = normalize(nameToRemove);
    setPendingAddNames((prev) => prev.filter((x) => normalize(x) !== n));
  }, []);

  return {
    approvedManufacturers,
    approvedVisible,
    setApprovedManufacturers,

    newApprovedName,
    setNewApprovedName,

    loadingApproved,
    approvedError,
    setApprovedError,

    pendingRemoveIds,
    setPendingRemoveIds,

    pendingAddNames,
    setPendingAddNames,

    pendingAddsNormalized,

    loadApproved,
    resetStaging,
    resetAll,

    stageDelete,
    undoDelete,
    removePendingAdd,
  };
}
