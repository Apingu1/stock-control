import { useCallback, useRef, useState } from "react";
import type {
  ExpiryThresholdRow,
  Issue,
  LotBalance,
  Material,
  Product,
  Receipt,
} from "../types";
import { apiFetch } from "../utils/api";

type LoadOptions = { silent?: boolean };

/**
 * Centralises App.tsx data state + loaders, without changing endpoints.
 * Background callers use { silent: true } so transient network failures retain
 * last-good data and do not toggle page-level loading/error state.
 */
export function useStockData() {
  const [lotBalances, setLotBalances] = useState<LotBalance[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [expiryThresholds, setExpiryThresholds] = useState<ExpiryThresholdRow[]>([]);

  const inFlightRef = useRef<Record<string, Promise<void> | undefined>>({});
  const runOnce = useCallback((key: string, task: () => Promise<void>) => {
    const existing = inFlightRef.current[key];
    if (existing) return existing;

    const promise = task().finally(() => {
      if (inFlightRef.current[key] === promise) delete inFlightRef.current[key];
    });
    inFlightRef.current[key] = promise;
    return promise;
  }, []);

  const [loadingLots, setLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState<string | null>(null);

  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);

  const [loadingIssues, setLoadingIssues] = useState(true);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const loadLotBalances = useCallback((options: LoadOptions = {}) => {
    return runOnce("lot-balances", async () => {
      const silent = !!options.silent;
      try {
        if (!silent) {
          setLoadingLots(true);
          setLotsError(null);
        }
        const res = await apiFetch("/lot-balances/");
        const data = (await res.json()) as LotBalance[];
        setLotBalances(data);
      } catch (e: any) {
        console.error(e);
        if (!silent) setLotsError(e?.message ?? "Failed to load lot balances");
      } finally {
        if (!silent) setLoadingLots(false);
      }
    });
  }, [runOnce]);

  const loadMaterials = useCallback((options: LoadOptions = {}) => {
    return runOnce("materials", async () => {
      try {
        const res = await apiFetch("/materials/");
        const data = (await res.json()) as Material[];
        setMaterials(data);
      } catch (e) {
        console.error(e);
        if (!options.silent) {
          // Existing UI has no materials error panel; keep prior data.
        }
      }
    });
  }, [runOnce]);

  const loadProducts = useCallback((options: LoadOptions = {}) => {
    return runOnce("products", async () => {
      const silent = !!options.silent;
      try {
        if (!silent) {
          setLoadingProducts(true);
          setProductsError(null);
        }
        const res = await apiFetch("/products/");
        const data = (await res.json()) as Product[];
        setProducts(data);
      } catch (e: unknown) {
        console.error(e);
        if (!silent) {
          setProducts([]);
          setProductsError(e instanceof Error ? e.message : "Failed to load Product List");
        }
      } finally {
        if (!silent) setLoadingProducts(false);
      }
    });
  }, [runOnce]);

  const loadExpiryThresholds = useCallback((options: LoadOptions = {}) => {
    return runOnce("expiry-thresholds", async () => {
      try {
        const res = await apiFetch("/materials/expiry-thresholds");
        const data = (await res.json()) as ExpiryThresholdRow[];
        setExpiryThresholds(data);
      } catch (e) {
        console.error(e);
        if (!options.silent) setExpiryThresholds([]);
      }
    });
  }, [runOnce]);

  const loadReceipts = useCallback((options: LoadOptions = {}) => {
    return runOnce("receipts", async () => {
      const silent = !!options.silent;
      try {
        if (!silent) {
          setLoadingReceipts(true);
          setReceiptsError(null);
        }
        const res = await apiFetch("/receipts/");
        const data = (await res.json()) as Receipt[];
        setReceipts(data);
      } catch (e: any) {
        console.error(e);
        if (!silent) setReceiptsError(e?.message ?? "Failed to load goods receipts");
      } finally {
        if (!silent) setLoadingReceipts(false);
      }
    });
  }, [runOnce]);

  const loadIssues = useCallback((options: LoadOptions = {}) => {
    return runOnce("issues", async () => {
      const silent = !!options.silent;
      try {
        if (!silent) {
          setLoadingIssues(true);
          setIssuesError(null);
        }
        const res = await apiFetch("/issues/");
        const data = (await res.json()) as Issue[];
        setIssues(data);
      } catch (e: any) {
        console.error(e);
        if (!silent) setIssuesError(e?.message ?? "Failed to load consumption history");
      } finally {
        if (!silent) setLoadingIssues(false);
      }
    });
  }, [runOnce]);

  const loadAll = useCallback(async (options: LoadOptions = {}) => {
    await Promise.all([
      loadLotBalances(options),
      loadMaterials(options),
      loadProducts(options),
      loadExpiryThresholds(options),
      loadReceipts(options),
      loadIssues(options),
    ]);
  }, [loadExpiryThresholds, loadIssues, loadLotBalances, loadMaterials, loadProducts, loadReceipts]);

  return {
    lotBalances,
    setLotBalances,
    materials,
    setMaterials,
    products,
    setProducts,
    receipts,
    setReceipts,
    issues,
    setIssues,
    expiryThresholds,
    setExpiryThresholds,

    loadingLots,
    lotsError,
    loadingReceipts,
    receiptsError,
    loadingIssues,
    issuesError,
    loadingProducts,
    productsError,

    loadLotBalances,
    loadMaterials,
    loadProducts,
    loadExpiryThresholds,
    loadReceipts,
    loadIssues,
    loadAll,
  };
}
