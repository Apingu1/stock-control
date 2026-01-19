import { useCallback, useState } from "react";
import type {
  ExpiryThresholdRow,
  Issue,
  LotBalance,
  Material,
  Receipt,
} from "../types";
import { apiFetch } from "../utils/api";

/**
 * Centralises App.tsx data state + loaders, without changing endpoints.
 */
export function useStockData() {
  const [lotBalances, setLotBalances] = useState<LotBalance[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [expiryThresholds, setExpiryThresholds] = useState<ExpiryThresholdRow[]>([]);

  // Loading / error flags
  const [loadingLots, setLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState<string | null>(null);

  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);

  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const loadLotBalances = useCallback(async () => {
    try {
      setLoadingLots(true);
      setLotsError(null);
      const res = await apiFetch("/lot-balances/");
      const data = (await res.json()) as LotBalance[];
      setLotBalances(data);
    } catch (e: any) {
      console.error(e);
      setLotsError(e?.message ?? "Failed to load lot balances");
    } finally {
      setLoadingLots(false);
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    try {
      const res = await apiFetch("/materials/");
      const data = (await res.json()) as Material[];
      setMaterials(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadExpiryThresholds = useCallback(async () => {
    try {
      const res = await apiFetch("/materials/expiry-thresholds");
      const data = (await res.json()) as ExpiryThresholdRow[];
      setExpiryThresholds(data);
    } catch (e) {
      console.error(e);
      setExpiryThresholds([]);
    }
  }, []);

  const loadReceipts = useCallback(async () => {
    try {
      setLoadingReceipts(true);
      setReceiptsError(null);
      const res = await apiFetch("/receipts/");
      const data = (await res.json()) as Receipt[];
      setReceipts(data);
    } catch (e: any) {
      console.error(e);
      setReceiptsError(e?.message ?? "Failed to load goods receipts");
    } finally {
      setLoadingReceipts(false);
    }
  }, []);

  const loadIssues = useCallback(async () => {
    try {
      setLoadingIssues(true);
      setIssuesError(null);
      const res = await apiFetch("/issues/");
      const data = (await res.json()) as Issue[];
      setIssues(data);
    } catch (e: any) {
      console.error(e);
      setIssuesError(e?.message ?? "Failed to load consumption history");
    } finally {
      setLoadingIssues(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadLotBalances(),
      loadMaterials(),
      loadExpiryThresholds(),
      loadReceipts(),
      loadIssues(),
    ]);
  }, [loadExpiryThresholds, loadIssues, loadLotBalances, loadMaterials, loadReceipts]);

  return {
    // data
    lotBalances,
    setLotBalances,
    materials,
    setMaterials,
    receipts,
    setReceipts,
    issues,
    setIssues,
    expiryThresholds,
    setExpiryThresholds,

    // flags
    loadingLots,
    lotsError,
    loadingReceipts,
    receiptsError,
    loadingIssues,
    issuesError,

    // loaders
    loadLotBalances,
    loadMaterials,
    loadExpiryThresholds,
    loadReceipts,
    loadIssues,
    loadAll,
  };
}
