import type { Material } from "../types";
import { apiFetch } from "./api";

// Materials are shared by the library, product formulas, receipt and consumption
// selectors. Fetch every page; the API intentionally caps each response.
const MATERIALS_PAGE_SIZE = 1000;

export async function fetchAllMaterials(): Promise<Material[]> {
  const materials: Material[] = [];

  for (let offset = 0; ; offset += MATERIALS_PAGE_SIZE) {
    const response = await apiFetch(
      `/materials/?limit=${MATERIALS_PAGE_SIZE}&offset=${offset}`
    );
    const page = (await response.json()) as Material[];
    if (!Array.isArray(page)) {
      throw new Error("Invalid materials response from server");
    }
    materials.push(...page);
    if (page.length < MATERIALS_PAGE_SIZE) return materials;
  }
}
