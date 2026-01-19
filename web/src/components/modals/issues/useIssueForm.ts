import { useEffect, useMemo, useState } from "react";
import type { Issue, LotBalance, Material } from "../../../types";
import type { ConsumptionTypeCode } from "./issueHelpers";
import { rankLotStatus } from "./issueHelpers";

export function useIssueForm(args: {
  open: boolean;
  mode: "create" | "edit";
  initial?: Issue;
  materials: Material[];
  lotBalances: LotBalance[];
  canSuperEditLockedFields: boolean;
}) {
  const { open, mode, initial, materials, lotBalances, canSuperEditLockedFields } = args;
  const isEdit = mode === "edit" && !!initial;

  const [consumptionType, setConsumptionType] = useState<ConsumptionTypeCode>("USAGE");

  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [selectedLot, setSelectedLot] = useState<LotBalance | null>(null);

  const [qty, setQty] = useState("");
  const [esProductCode, setEsProductCode] = useState<string>("");

  const [productBatchNo, setProductBatchNo] = useState("");
  const [productManufactureDate, setProductManufactureDate] = useState("");
  const [comment, setComment] = useState("");
  const [manufacturer, setManufacturer] = useState("");

  const [editReason, setEditReason] = useState("");

  // Non-superuser: in edit mode, block changing the traceability fields (material + lot).
  // Superuser can change them (backend still audit-trails via edit_reason).
  const canEditTraceabilityFields = !isEdit || canSuperEditLockedFields;

  useEffect(() => {
    if (!open) return;

    if (isEdit && initial) {
      setConsumptionType((initial.consumption_type as ConsumptionTypeCode) || "USAGE");

      setMaterialSearch(`${initial.material_name} (${initial.material_code})`);
      const mat = materials.find((m) => m.material_code === initial.material_code) || null;
      setSelectedMaterial(mat);

      const lot =
        lotBalances.find(
          (l) => l.material_code === initial.material_code && l.lot_number === initial.lot_number
        ) || null;
      setSelectedLot(lot);

      setQty(String(initial.qty ?? ""));
      setEsProductCode((initial as any).es_product_code || "");
      setProductBatchNo(initial.product_batch_no || "");
      setProductManufactureDate(
        initial.product_manufacture_date ? String(initial.product_manufacture_date).slice(0, 10) : ""
      );
      setComment(initial.comment || "");
      setManufacturer(initial.manufacturer || "");
      setEditReason("");
      return;
    }

    // Create reset
    setConsumptionType("USAGE");
    setMaterialSearch("");
    setSelectedMaterial(null);
    setSelectedLot(null);
    setQty("");
    setEsProductCode("");
    setProductBatchNo("");
    setProductManufactureDate("");
    setComment("");
    setManufacturer("");
    setEditReason("");
  }, [open, isEdit, initial, materials, lotBalances]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials.slice(0, 15);
    return materials
      .filter((m) => m.material_code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 15);
  }, [materialSearch, materials]);

  const lotsForMaterial = useMemo(() => {
    if (!selectedMaterial) return [];
    return lotBalances
      .filter((lot) => lot.material_code === selectedMaterial.material_code && lot.balance_qty > 0)
      .sort((a, b) => rankLotStatus(a.status) - rankLotStatus(b.status));
  }, [selectedMaterial, lotBalances]);

  const isBatchRequired = consumptionType === "USAGE";
  const isBatchOptional = consumptionType === "R_AND_D";
  const isBatchIrrelevant = consumptionType === "WASTAGE" || consumptionType === "DESTRUCTION";
  const showBatchFields = !isBatchIrrelevant;

  const quantityUom = selectedLot?.uom_code || selectedMaterial?.base_uom_code || "";
  const isQuarantined = (selectedLot?.status || "").toUpperCase() === "QUARANTINE";

  const handleSelectMaterial = (m: Material) => {
    setSelectedMaterial(m);
    setMaterialSearch(`${m.name} (${m.material_code})`);
    setSelectedLot(null);
    setManufacturer("");
  };

  const handleSelectLot = (lotId: string) => {
    const idNum = Number(lotId);
    const lot = lotsForMaterial.find((l) => l.material_lot_id === idNum);
    setSelectedLot(lot || null);
    setManufacturer(lot?.manufacturer || "");
  };

  return {
    isEdit,
    canEditTraceabilityFields,

    consumptionType,
    setConsumptionType,

    materialSearch,
    setMaterialSearch,
    filteredMaterials,

    selectedMaterial,
    setSelectedMaterial,
    handleSelectMaterial,

    selectedLot,
    setSelectedLot,
    lotsForMaterial,
    handleSelectLot,

    qty,
    setQty,
    esProductCode,
    setEsProductCode,

    productBatchNo,
    setProductBatchNo,
    productManufactureDate,
    setProductManufactureDate,
    comment,
    setComment,
    manufacturer,
    setManufacturer,

    editReason,
    setEditReason,

    isBatchRequired,
    isBatchOptional,
    isBatchIrrelevant,
    showBatchFields,

    quantityUom,
    isQuarantined,
  };
}
