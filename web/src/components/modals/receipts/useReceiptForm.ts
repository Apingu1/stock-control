import { useEffect, useMemo, useState } from "react";
import type { ApprovedManufacturer, Material, Receipt } from "../../../types";
import { calcUnitCost } from "./receiptHelpers";

export function useReceiptForm(args: {
  open: boolean;
  mode: "create" | "edit";
  initial?: Receipt;
  materials: Material[];
  canSuperEditLockedFields: boolean;
}) {
  const { open, mode, initial, materials, canSuperEditLockedFields } = args;
  const isEdit = mode === "edit" && !!initial;

  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [qty, setQty] = useState("");

  // D1: total line cost
  const [totalCost, setTotalCost] = useState("");

  const [supplier, setSupplier] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [compliesEs, setCompliesEs] = useState(false);

  const [editReason, setEditReason] = useState("");

  const lockTraceabilityFields = isEdit && !canSuperEditLockedFields;

  useEffect(() => {
    if (!open) return;

    if (isEdit && initial) {
      setMaterialSearch(`${initial.material_name} (${initial.material_code})`);
      const mat = materials.find((m) => m.material_code === initial.material_code) || null;
      setSelectedMaterial(mat);

      setLotNumber(initial.lot_number || "");
      setExpiryDate(initial.expiry_date ? String(initial.expiry_date).slice(0, 10) : "");
      setReceiptDate(initial.created_at ? String(initial.created_at).slice(0, 10) : "");
      setQty(String(initial.qty ?? ""));

      setTotalCost(initial.total_value != null ? String(initial.total_value) : "");

      setSupplier(initial.supplier || "");
      setManufacturer(initial.manufacturer || "");
      setCompliesEs(initial.complies_es_criteria === true);
      setEditReason("");
      return;
    }

    // Create reset
    setMaterialSearch("");
    setSelectedMaterial(null);
    setLotNumber("");
    setExpiryDate("");
    setReceiptDate("");
    setQty("");
    setTotalCost("");
    setSupplier("");
    setManufacturer("");
    setCompliesEs(false);
    setEditReason("");
  }, [open, isEdit, initial, materials]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials.slice(0, 15);
    return materials
      .filter((m) => m.material_code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 15);
  }, [materialSearch, materials]);

  const handleSelectMaterial = (m: Material) => {
    setSelectedMaterial(m);
    setMaterialSearch(`${m.name} (${m.material_code})`);
    setManufacturer("");
  };

  const isTabletsCaps = selectedMaterial?.category_code === "TABLETS_CAPSULES";

  const approvedForMaterial: ApprovedManufacturer[] = useMemo(() => {
    if (!selectedMaterial?.approved_manufacturers) return [];
    return selectedMaterial.approved_manufacturers.filter((am) => am.is_active);
  }, [selectedMaterial]);

  const hasApproved = approvedForMaterial.length > 0;

  const calculatedUnitCost = useMemo(() => {
    return calcUnitCost(qty, totalCost);
  }, [qty, totalCost]);

  return {
    isEdit,

    materialSearch,
    setMaterialSearch,
    selectedMaterial,
    setSelectedMaterial,
    filteredMaterials,
    handleSelectMaterial,

    lotNumber,
    setLotNumber,
    expiryDate,
    setExpiryDate,
    receiptDate,
    setReceiptDate,
    qty,
    setQty,
    totalCost,
    setTotalCost,

    supplier,
    setSupplier,
    manufacturer,
    setManufacturer,
    compliesEs,
    setCompliesEs,

    editReason,
    setEditReason,

    lockTraceabilityFields,
    canSuperEditLockedFields,

    isTabletsCaps,
    approvedForMaterial,
    hasApproved,

    calculatedUnitCost,
  };
}
