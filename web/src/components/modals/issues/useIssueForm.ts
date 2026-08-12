import { useEffect, useMemo, useRef, useState } from "react";
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
  const materialsRef = useRef(materials);
  const lotBalancesRef = useRef(lotBalances);
  materialsRef.current = materials;
  lotBalancesRef.current = lotBalances;

  const [consumptionType, setConsumptionType] = useState<ConsumptionTypeCode>("USAGE");
  const [materialSearch, setMaterialSearch] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [selectedLot, setSelectedLot] = useState<LotBalance | null>(null);
  const [qty, setQty] = useState("");
  const [esProductCode, setEsProductCode] = useState("");
  const [productBatchNo, setProductBatchNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [productManufactureDate, setProductManufactureDate] = useState("");
  const [totalBatchSize, setTotalBatchSize] = useState("");
  const [batchSizeUom, setBatchSizeUom] = useState("");
  const [numberOfUnits, setNumberOfUnits] = useState("");
  const [comment, setComment] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [editReason, setEditReason] = useState("");

  const canEditTraceabilityFields = !isEdit || canSuperEditLockedFields;

  useEffect(() => {
    if (!open) return;

    if (isEdit && initial) {
      setConsumptionType((initial.consumption_type as ConsumptionTypeCode) || "USAGE");
      setMaterialSearch(`${initial.material_name} (${initial.material_code})`);
      setSelectedMaterial(
        materialsRef.current.find((material) => material.material_code === initial.material_code) || null
      );
      setSelectedLot(
        lotBalancesRef.current.find(
          (lot) =>
            lot.material_code === initial.material_code &&
            lot.lot_number === initial.lot_number
        ) || null
      );
      setQty(String(initial.qty ?? ""));
      setEsProductCode(initial.es_product_code || "");
      setProductBatchNo(initial.product_batch_no || "");
      setCustomerName(initial.customer_name || "");
      setProductManufactureDate(
        initial.product_manufacture_date
          ? String(initial.product_manufacture_date).slice(0, 10)
          : ""
      );
      setTotalBatchSize(
        initial.total_batch_size === null || initial.total_batch_size === undefined
          ? ""
          : String(initial.total_batch_size)
      );
      setBatchSizeUom(initial.batch_size_uom || "");
      setNumberOfUnits(
        initial.number_of_units === null || initial.number_of_units === undefined
          ? ""
          : String(initial.number_of_units)
      );
      setComment(initial.comment || "");
      setManufacturer(initial.manufacturer || "");
      setEditReason("");
      return;
    }

    setConsumptionType("USAGE");
    setMaterialSearch("");
    setSelectedMaterial(null);
    setSelectedLot(null);
    setQty("");
    setEsProductCode("");
    setProductBatchNo("");
    setCustomerName("");
    setProductManufactureDate("");
    setTotalBatchSize("");
    setBatchSizeUom("");
    setNumberOfUnits("");
    setComment("");
    setManufacturer("");
    setEditReason("");
  }, [open, isEdit, initial]);

  useEffect(() => {
    if (!open || !selectedMaterial) return;
    const fresh = materials.find(
      (material) => material.material_code === selectedMaterial.material_code
    );
    if (fresh && fresh !== selectedMaterial) setSelectedMaterial(fresh);
  }, [open, materials, selectedMaterial]);

  useEffect(() => {
    if (!open || !selectedLot) return;
    const fresh = lotBalances.find(
      (lot) => lot.material_lot_id === selectedLot.material_lot_id
    );
    if (fresh) {
      if (fresh !== selectedLot) setSelectedLot(fresh);
      return;
    }
    if (Number(selectedLot.balance_qty) !== 0) {
      setSelectedLot({ ...selectedLot, balance_qty: 0 });
    }
  }, [open, lotBalances, selectedLot]);

  const filteredMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    const stockMaterials = materials.filter((material) => !material.is_cancelled_bmr_marker);
    if (!query) return stockMaterials.slice(0, 15);
    return stockMaterials
      .filter(
        (material) =>
          material.material_code.toLowerCase().includes(query) ||
          material.name.toLowerCase().includes(query)
      )
      .slice(0, 15);
  }, [materialSearch, materials]);

  const lotsForMaterial = useMemo(() => {
    if (!selectedMaterial) return [];
    return lotBalances
      .filter(
        (lot) => lot.material_code === selectedMaterial.material_code && lot.balance_qty > 0
      )
      .sort((a, b) => rankLotStatus(a.status) - rankLotStatus(b.status));
  }, [selectedMaterial, lotBalances]);

  const isBatchRequired = consumptionType === "USAGE";
  const isBatchOptional = consumptionType === "R_AND_D";
  const isBatchIrrelevant =
    consumptionType === "WASTAGE" || consumptionType === "DESTRUCTION";
  const showBatchFields = !isBatchIrrelevant;

  const quantityUom = selectedLot?.uom_code || selectedMaterial?.base_uom_code || "";
  const isQuarantined = (selectedLot?.status || "").toUpperCase() === "QUARANTINE";

  const handleSelectMaterial = (material: Material) => {
    setSelectedMaterial(material);
    setMaterialSearch(`${material.name} (${material.material_code})`);
    setSelectedLot(null);
    setManufacturer("");
  };

  const handleSelectLot = (lotId: string) => {
    const id = Number(lotId);
    const lot = lotsForMaterial.find((candidate) => candidate.material_lot_id === id);
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
    customerName,
    setCustomerName,
    productManufactureDate,
    setProductManufactureDate,
    totalBatchSize,
    setTotalBatchSize,
    batchSizeUom,
    setBatchSizeUom,
    numberOfUnits,
    setNumberOfUnits,
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
