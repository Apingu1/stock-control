import { apiFetch } from "./api";

/**
 * Return a complete dataset in bounded requests. The per-request page size
 * is a transport safety limit, never a cap on company records.
 */
export async function fetchAllPages<T>(
  endpoint: string,
  pageSize = 500
): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await apiFetch(
      `${endpoint}${separator}limit=${pageSize}&offset=${offset}`
    );
    const page: unknown = await response.json();
    if (!Array.isArray(page)) {
      throw new Error(`Unexpected paginated response from ${endpoint}`);
    }
    items.push(...(page as T[]));
    if (page.length < pageSize) return items;
  }
}
