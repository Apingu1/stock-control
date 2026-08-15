import { useEffect, useMemo, useState } from "react";
import type { LotBalance, Product } from "../../types";
import { CONSUMPTION_TYPES } from "../../constants";
import { apiFetch } from "../../utils/api";
import { useBackgroundRefresh } from "../../hooks/useBackgroundRefresh";
import type { ConsumptionTypeCode } from "./issues/issueHelpers";
import { formatDateShort, rankLotStatus } from "./issues/issueHelpers";

type StockUseLine = {
  clientId: string;
  lotSearch: string;
  selectedLot: LotBalance | null;
  qty: string;
  error: string | null;
};

type StockUseSection = "material" | "packaging";

const newLine = (section: StockUseSection): StockUseLine => ({
  clientId: `${section}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  lotSearch: "",
  selectedLot: null,
  qty: "",
  error: null,
});

const isPackagingStock = (
  stock: Pick<LotBalance, "category_code" | "type_code">
) =>
  [stock.category_code, stock.type_code].some(
    (value) => (value || "").trim().toUpperCase() === "PACKAGING"
  );

const displayQty = (value: number | string) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("en-GB", { maximumFractionDigits: 6 })
    : String(value);
};

const apiErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : "Failed to post consumption";
  const start = raw.indexOf('{"detail"');
  if (start >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(start)) as { detail?: string | { message?: string } };
      if (typeof parsed.detail === "string") return parsed.detail;
      if (parsed.detail?.message) return parsed.detail.message;
    } catch {
      // Preserve the original response when it is not JSON.
    }
  }
  return raw;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onIssuePosted: () => void;
  lotBalances: LotBalance[];
  products: Product[];
  createdBy: string;
  canApproveRejectedBatch: boolean;
  canRecordCancelledBmr: boolean;
};

export default function BatchIssueCreateModal({
  open,
  onClose,
  onIssuePosted,
  lotBalances,
  products,
  createdBy,
  canApproveRejectedBatch,
  canRecordCancelledBmr,
}: Props) {
  const [cancelledMode, setCancelledMode] = useState(false);
  const [consumptionType, setConsumptionType] = useState<ConsumptionTypeCode>("USAGE");
  const [productCode, setProductCode] = useState("");
  const [productBatchNo, setProductBatchNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [productManufactureDate, setProductManufactureDate] = useState("");
  const [totalBatchSize, setTotalBatchSize] = useState("");
  const [batchSizeUom, setBatchSizeUom] = useState("");
  const [numberOfUnits, setNumberOfUnits] = useState("");
  const [targetRef, setTargetRef] = useState("");
  const [comment, setComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approveRejected, setApproveRejected] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [inactiveOverrideReason, setInactiveOverrideReason] = useState("");
  const [materialLines, setMaterialLines] = useState<StockUseLine[]>([
    newLine("material"),
  ]);
  const [packagingLines, setPackagingLines] = useState<StockUseLine[]>([
    newLine("packaging"),
  ]);
  const [allowQuarantine, setAllowQuarantine] = useState<boolean | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [complianceReviewed, setComplianceReviewed] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.product_code === productCode) || null,
    [productCode, products]
  );

  const selectableLots = useMemo(
    () =>
      [...lotBalances]
        .filter((lot) => Number(lot.balance_qty) > 0 && lot.material_code !== "Cancelled BMR")
        .sort((a, b) => {
          const statusOrder = rankLotStatus(a.status) - rankLotStatus(b.status);
          return (
            statusOrder ||
            a.material_code.localeCompare(b.material_code) ||
            a.lot_number.localeCompare(b.lot_number)
          );
        }),
    [lotBalances]
  );

  const selectableMaterialLots = useMemo(
    () => selectableLots.filter((lot) => !isPackagingStock(lot)),
    [selectableLots]
  );
  const selectablePackagingLots = useMemo(
    () => selectableLots.filter(isPackagingStock),
    [selectableLots]
  );

  const expectedCodes = useMemo(
    () =>
      new Set(
        selectedProduct?.materials
          .filter((material) => !isPackagingStock(material))
          .map((material) => material.material_code) || []
      ),
    [selectedProduct]
  );
  const actualCodes = useMemo(
    () =>
      new Set(
        materialLines.flatMap((line) =>
          line.selectedLot ? [line.selectedLot.material_code] : []
        )
      ),
    [materialLines]
  );
  const missingCodes = [...expectedCodes].filter((code) => !actualCodes.has(code));
  const unexpectedCodes = [...actualCodes].filter((code) => !expectedCodes.has(code));
  const inactiveProduct = selectedProduct?.status === "INACTIVE";
  const productControlsApply =
    !cancelledMode &&
    Boolean(selectedProduct) &&
    (consumptionType === "USAGE" || consumptionType === "R_AND_D");
  const hasComplianceProblem =
    productControlsApply &&
    (inactiveProduct || missingCodes.length > 0 || unexpectedCodes.length > 0);
  const displayComplianceProblem = complianceReviewed && hasComplianceProblem;

  useEffect(() => {
    if (!open) return;
    setCancelledMode(false);
    setConsumptionType("USAGE");
    setProductCode("");
    setProductBatchNo("");
    setCustomerName("");
    setProductManufactureDate("");
    setTotalBatchSize("");
    setBatchSizeUom("");
    setNumberOfUnits("");
    setTargetRef("");
    setComment("");
    setRejectionReason("");
    setApproveRejected(false);
    setCancellationReason("");
    setInactiveOverrideReason("");
    setMaterialLines([newLine("material")]);
    setPackagingLines([newLine("packaging")]);
    setSubmitError(null);
    setComplianceReviewed(false);
    setPolicyError(null);
    setAllowQuarantine(null);
    void (async () => {
      try {
        const response = await apiFetch("/quarantine/policy");
        const policy = (await response.json()) as { allow_issue_from_quarantine: boolean };
        setAllowQuarantine(Boolean(policy.allow_issue_from_quarantine));
      } catch {
        setAllowQuarantine(false);
        setPolicyError("Quarantine policy could not be checked. Quarantined lots are disabled.");
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const freshById = new Map(lotBalances.map((lot) => [lot.material_lot_id, lot]));
    const refreshSelectedLots = (current: StockUseLine[]) => {
      let changed = false;
      const next = current.map((line) => {
        if (!line.selectedLot) return line;
        const fresh = freshById.get(line.selectedLot.material_lot_id);
        if (fresh) {
          if (fresh === line.selectedLot) return line;
          changed = true;
          return { ...line, selectedLot: fresh };
        }
        if (Number(line.selectedLot.balance_qty) === 0) return line;
        changed = true;
        return {
          ...line,
          selectedLot: { ...line.selectedLot, balance_qty: 0 },
        };
      });
      return changed ? next : current;
    };
    setMaterialLines(refreshSelectedLots);
    setPackagingLines(refreshSelectedLots);
  }, [open, lotBalances]);

  useBackgroundRefresh(
    async () => {
      const response = await apiFetch("/quarantine/policy");
      const policy = (await response.json()) as { allow_issue_from_quarantine: boolean };
      setAllowQuarantine(Boolean(policy.allow_issue_from_quarantine));
    },
    { enabled: open, intervalMs: 5_000, label: "consumption quarantine policy refresh" }
  );

  if (!open) return null;

  const showBatchFields = consumptionType === "USAGE" || consumptionType === "R_AND_D";
  const usageRequired = consumptionType === "USAGE";

  const chooseProduct = (code: string) => {
    setProductCode(code);
    setApproveRejected(false);
    setRejectionReason("");
    setComplianceReviewed(false);
    if (!cancelledMode) {
      setMaterialLines([newLine("material")]);
      setPackagingLines([newLine("packaging")]);
    }
  };

  const toggleCancelledMode = () => {
    const nextCancelledMode = !cancelledMode;
    setCancelledMode(nextCancelledMode);
    setApproveRejected(false);
    setRejectionReason("");
    setInactiveOverrideReason("");
    setSubmitError(null);
    setComplianceReviewed(false);
    setMaterialLines([newLine("material")]);
    setPackagingLines([newLine("packaging")]);
  };

  const blockedReason = (lot: LotBalance) => {
    const status = (lot.status || "").toUpperCase();
    if (status === "REJECTED") return "Rejected lots cannot be issued";
    if (status === "QUARANTINE" && allowQuarantine === null) {
      return "Checking quarantine policy";
    }
    if (status === "QUARANTINE" && !allowQuarantine) {
      return "Quarantine issuing is blocked by policy";
    }
    return null;
  };

  const updateLine = (
    section: StockUseSection,
    id: string,
    patch: Partial<StockUseLine>
  ) => {
    setComplianceReviewed(false);
    setApproveRejected(false);
    setRejectionReason("");
    const update = (current: StockUseLine[]) =>
      current.map((line) => (line.clientId === id ? { ...line, ...patch } : line));
    if (section === "packaging") setPackagingLines(update);
    else setMaterialLines(update);
  };

  const suggestionsFor = (section: StockUseSection, line: StockUseLine) => {
    if (!line.lotSearch.trim() || line.selectedLot) return [];
    const query = line.lotSearch.trim().toLowerCase();
    const stock =
      section === "packaging" ? selectablePackagingLots : selectableMaterialLots;
    return stock
      .filter((lot) => lot.lot_number.toLowerCase().includes(query))
      .slice(0, 18);
  };

  const selectLot = (
    section: StockUseSection,
    line: StockUseLine,
    lot: LotBalance
  ) => {
    const blocked = blockedReason(lot);
    if (blocked) return updateLine(section, line.clientId, { error: blocked });
    if (
      [...materialLines, ...packagingLines].some(
        (other) =>
          other.clientId !== line.clientId &&
          other.selectedLot?.material_lot_id === lot.material_lot_id
      )
    ) {
      return updateLine(section, line.clientId, {
        error: "This exact lot segment is already included.",
      });
    }
    updateLine(section, line.clientId, {
      selectedLot: lot,
      lotSearch: lot.lot_number,
      qty: "",
      error: null,
    });
  };

  const validateStandard = () => {
    if (!createdBy.trim()) {
      setSubmitError("Not signed in. Please re-login.");
      return false;
    }
    if (usageRequired && !selectedProduct) {
      setSubmitError("Select a product from the Product List.");
      return false;
    }
    if (usageRequired && !productBatchNo.trim()) {
      setSubmitError("Enter the ES batch number.");
      return false;
    }
    if (usageRequired && !productManufactureDate) {
      setSubmitError("Enter the product manufacture date.");
      return false;
    }
    if (usageRequired && (!(Number(totalBatchSize) > 0) || !batchSizeUom.trim())) {
      setSubmitError("Enter a valid total batch size and unit.");
      return false;
    }
    if (
      usageRequired &&
      (!Number.isInteger(Number(numberOfUnits)) || Number(numberOfUnits) <= 0)
    ) {
      setSubmitError("Enter a whole number of units greater than zero.");
      return false;
    }
    if (consumptionType === "DESTRUCTION" && !comment.trim()) {
      setSubmitError("Enter a destruction comment.");
      return false;
    }

    let valid = true;
    const seen = new Set<number>();
    const validateLines = (
      current: StockUseLine[],
      section: StockUseSection
    ) =>
      current.map((line, index) => {
        const label = section === "packaging" ? "Packaging entry" : "Material entry";
        let error: string | null = null;
        if (!line.selectedLot) error = `${label} ${index + 1}: select a lot.`;
        else if (seen.has(line.selectedLot.material_lot_id)) {
          error = `${label} ${index + 1}: duplicate lot segment.`;
        } else if (
          section === "packaging" &&
          !isPackagingStock(line.selectedLot)
        ) {
          error = `${label} ${index + 1}: select packaging stock.`;
        } else if (
          section === "material" &&
          isPackagingStock(line.selectedLot)
        ) {
          error = `${label} ${index + 1}: use the Packaging Used section.`;
        } else {
          seen.add(line.selectedLot.material_lot_id);
          const quantity = Number(line.qty);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            error = `${label} ${index + 1}: enter a quantity greater than zero.`;
          } else if (quantity > Number(line.selectedLot.balance_qty)) {
            error = `${label} ${index + 1}: insufficient stock.`;
          }
        }
        if (error) valid = false;
        return { ...line, error };
      });
    setMaterialLines(validateLines(materialLines, "material"));
    if (showBatchFields) {
      setPackagingLines(validateLines(packagingLines, "packaging"));
    }
    if (!valid) {
      setSubmitError(
        showBatchFields
          ? "Correct the highlighted material and packaging entries. At least one packaging lot is required."
          : "Correct the highlighted material entries."
      );
      return false;
    }
    if (hasComplianceProblem && !complianceReviewed) {
      setComplianceReviewed(true);
      setSubmitError(
        canApproveRejectedBatch
          ? "The entries do not match the configured product. Review the compliance warning before continuing."
          : "The entries do not match the configured product and require a senior operator."
      );
      return false;
    }
    if (hasComplianceProblem && !approveRejected) {
      setSubmitError(
        canApproveRejectedBatch
          ? "This batch is non-compliant. Select ‘Approve as rejected batch’ to continue."
          : "This batch is non-compliant and requires a senior operator with rejected-batch permission."
      );
      return false;
    }
    if (hasComplianceProblem && approveRejected && !rejectionReason.trim()) {
      setSubmitError("A rejected batch reason is required.");
      return false;
    }
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (cancelledMode) {
      if (!selectedProduct || !productBatchNo.trim() || !cancellationReason.trim()) {
        setSubmitError("Product, batch number and cancellation reason are required.");
        return;
      }
      if (inactiveProduct && (!approveRejected || !inactiveOverrideReason.trim())) {
        setSubmitError(
          canApproveRejectedBatch
            ? "Approve the inactive-product override and enter its reason."
            : "An inactive product requires a senior rejected-batch approval."
        );
        return;
      }
    } else if (!validateStandard()) return;

    setSubmitting(true);
    try {
      if (cancelledMode) {
        await apiFetch("/issues/batch/cancelled", {
          method: "POST",
          body: JSON.stringify({
            es_product_code: selectedProduct!.product_code,
            product_batch_no: productBatchNo.trim(),
            customer_name: customerName.trim() || null,
            target_ref: targetRef.trim() || null,
            cancellation_reason: cancellationReason.trim(),
            approve_inactive_product: Boolean(inactiveProduct && approveRejected),
            inactive_product_reason: inactiveProduct
              ? inactiveOverrideReason.trim() || null
              : null,
          }),
        });
      } else {
        await apiFetch("/issues/batch", {
          method: "POST",
          body: JSON.stringify({
            consumption_type: consumptionType,
            es_product_code: showBatchFields
              ? selectedProduct?.product_code || null
              : null,
            product_batch_no: showBatchFields ? productBatchNo.trim() || null : null,
            customer_name: showBatchFields ? customerName.trim() || null : null,
            product_manufacture_date: showBatchFields
              ? productManufactureDate || null
              : null,
            total_batch_size:
              showBatchFields && totalBatchSize ? Number(totalBatchSize) : null,
            batch_size_uom: showBatchFields ? batchSizeUom.trim() || null : null,
            number_of_units:
              showBatchFields && numberOfUnits ? Number(numberOfUnits) : null,
            target_ref: targetRef.trim() || null,
            comment: comment.trim() || null,
            approve_as_rejected_batch: Boolean(
              hasComplianceProblem && approveRejected
            ),
            rejection_reason: hasComplianceProblem
              ? rejectionReason.trim() || null
              : null,
            items: materialLines.map((line) => ({
              material_code: line.selectedLot!.material_code,
              lot_number: line.selectedLot!.lot_number,
              material_lot_id: line.selectedLot!.material_lot_id,
              qty: Number(line.qty),
              uom_code: line.selectedLot!.uom_code,
            })),
            packaging_items: showBatchFields
              ? packagingLines.map((line) => ({
                  material_code: line.selectedLot!.material_code,
                  lot_number: line.selectedLot!.lot_number,
                  material_lot_id: line.selectedLot!.material_lot_id,
                  qty: Number(line.qty),
                  uom_code: line.selectedLot!.uom_code,
                }))
              : [],
          }),
        });
      }
      onIssuePosted();
      onClose();
    } catch (error) {
      setSubmitError(apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const renderStockUseSection = (
    section: StockUseSection,
    title: string,
    help: string,
    sectionLines: StockUseLine[]
  ) => {
    const packagingSection = section === "packaging";
    const entryLabel = packagingSection ? "Packaging entry" : "Material entry";
    const selectedLabel = packagingSection ? "Packaging" : "Material";

    return (
      <section className="issue-batch-section">
        <div className="issue-batch-section-heading">
          <div>
            <div className="issue-batch-section-title">{title}</div>
            <div className="issue-batch-section-help">{help}</div>
          </div>
          <span className="issue-material-count">
            {sectionLines.length} line{sectionLines.length === 1 ? "" : "s"}
          </span>
        </div>
        {!packagingSection && policyError && (
          <div className="issue-policy-warning">{policyError}</div>
        )}
        <div className="issue-material-list">
          {sectionLines.map((line, index) => {
            const lot = line.selectedLot;
            const suggestions = suggestionsFor(section, line);
            const unexpected = Boolean(
              !packagingSection &&
                complianceReviewed &&
                lot &&
                productControlsApply &&
                !expectedCodes.has(lot.material_code)
            );
            return (
              <div
                className={`issue-material-card ${
                  unexpected ? "issue-material-noncompliant" : ""
                }`}
                key={line.clientId}
              >
                <div className="issue-material-card-header">
                  <div className="issue-material-number">
                    {entryLabel} {index + 1}
                  </div>
                  {sectionLines.length > 1 && (
                    <button
                      className="btn btn-ghost issue-remove-material"
                      type="button"
                      onClick={() => {
                        setComplianceReviewed(false);
                        setApproveRejected(false);
                        setRejectionReason("");
                        const remove = (current: StockUseLine[]) =>
                          current.filter((item) => item.clientId !== line.clientId);
                        if (packagingSection) setPackagingLines(remove);
                        else setMaterialLines(remove);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="issue-material-grid">
                  <div className="form-group">
                    <label className="label">Lot number</label>
                    <div className="typeahead-wrap">
                      <input
                        className="input"
                        value={line.lotSearch}
                        onChange={(event) =>
                          updateLine(section, line.clientId, {
                            lotSearch: event.target.value,
                            selectedLot: null,
                            qty: "",
                            error: null,
                          })
                        }
                        placeholder="Start typing the receipt lot number…"
                      />
                      {suggestions.length > 0 && (
                        <div className="typeahead-dropdown issue-lot-dropdown">
                          {suggestions.map((suggestion) => {
                            const blocked = blockedReason(suggestion);
                            return (
                              <button
                                type="button"
                                key={suggestion.material_lot_id}
                                className={`typeahead-option ${
                                  blocked ? "is-disabled" : ""
                                }`}
                                disabled={Boolean(blocked)}
                                onClick={() => selectLot(section, line, suggestion)}
                              >
                                <div className="typeahead-main">
                                  {suggestion.lot_number} — {suggestion.material_name} (
                                  {suggestion.material_code})
                                </div>
                                <div className="typeahead-meta">
                                  EXP {formatDateShort(suggestion.expiry_date)} •{" "}
                                  {suggestion.status} • {displayQty(suggestion.balance_qty)}{" "}
                                  {suggestion.uom_code}
                                  {blocked ? ` • ${blocked}` : ""}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Quantity used {lot ? `(${lot.uom_code})` : ""}
                    </label>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={line.qty}
                      disabled={!lot}
                      onChange={(event) =>
                        updateLine(section, line.clientId, {
                          qty: event.target.value,
                          error: null,
                        })
                      }
                    />
                  </div>
                </div>

                {lot && (
                  <div className="issue-selected-lot">
                    <div>
                      <span>{selectedLabel}</span>
                      <strong>{lot.material_name}</strong>
                      <small>{lot.material_code}</small>
                    </div>
                    <div><span>Lot</span><strong>{lot.lot_number}</strong></div>
                    <div><span>Expiry</span><strong>{formatDateShort(lot.expiry_date)}</strong></div>
                    <div><span>Status</span><strong>{lot.status}</strong></div>
                    <div>
                      <span>Available</span>
                      <strong>{displayQty(lot.balance_qty)} {lot.uom_code}</strong>
                    </div>
                  </div>
                )}

                {unexpected && (
                  <div className="issue-quarantine-warning">
                    <strong>Incorrect material:</strong> {lot!.material_code} is not
                    configured for {selectedProduct!.product_code}.
                  </div>
                )}
                {line.error && <div className="form-error">{line.error}</div>}
              </div>
            );
          })}
        </div>
        <button
          className="btn issue-add-material"
          type="button"
          onClick={() => {
            setComplianceReviewed(false);
            setApproveRejected(false);
            setRejectionReason("");
            if (packagingSection) {
              setPackagingLines((current) => [...current, newLine("packaging")]);
            } else {
              setMaterialLines((current) => [...current, newLine("material")]);
            }
          }}
        >
          ＋ Add {packagingSection ? "packaging" : "material"}
        </button>
      </section>
    );
  };

  return (
    <div className="modal-overlay">
      <form className="modal issue-batch-modal" onSubmit={submit}>
        <div className="modal-header issue-batch-header">
          <div>
            <div className="modal-title">
              {cancelledMode ? "Record Cancelled BMR" : "New Consumption"}
            </div>
            <div className="modal-subtitle">
              {cancelledMode
                ? "Records an abandoned batch number with zero stock, quantity and value."
                : "Select a Product List item and record all material and packaging stock used."}
            </div>
          </div>
          <div className="rowline">
            {canRecordCancelledBmr && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={toggleCancelledMode}
              >
                {cancelledMode ? "Standard consumption" : "Cancelled BMR"}
              </button>
            )}
            <button
              className="icon-btn"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="issue-batch-scroll">
          <section className="issue-batch-section">
            <div className="form-grid issue-batch-details-grid">
              {!cancelledMode && (
                <div className="form-group">
                  <label className="label">Consumption type</label>
                  <select
                    className="input"
                    value={consumptionType}
                    onChange={(event) => {
                      const value = event.target.value as ConsumptionTypeCode;
                      setConsumptionType(value);
                      setPackagingLines([newLine("packaging")]);
                      if (value !== "USAGE" && value !== "R_AND_D") chooseProduct("");
                    }}
                  >
                    {CONSUMPTION_TYPES.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(showBatchFields || cancelledMode) && (
                <div className="form-group">
                  <label className="label">
                    Product List item ({cancelledMode || usageRequired ? "required" : "optional"})
                  </label>
                  <select
                    className="input"
                    value={productCode}
                    onChange={(event) => chooseProduct(event.target.value)}
                  >
                    <option value="">Select product…</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.product_code}>
                        {product.product_code} — {product.product_name}
                        {product.status === "INACTIVE" ? " (INACTIVE)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(showBatchFields || cancelledMode) && (
                <div className="form-group">
                  <label className="label">ES batch number (required)</label>
                  <input
                    className="input"
                    value={productBatchNo}
                    onChange={(e) => setProductBatchNo(e.target.value)}
                  />
                </div>
              )}

              {(showBatchFields || cancelledMode) && (
                <div className="form-group">
                  <label className="label">Customer name (optional)</label>
                  <input
                    className="input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g Cohen's C100, Stock"
                    maxLength={255}
                  />
                </div>
              )}

              {!cancelledMode && showBatchFields && (
                <>
                  <div className="form-group">
                    <label className="label">
                      Product manufacture date {usageRequired ? "(required)" : ""}
                    </label>
                    <input
                      className="input"
                      type="date"
                      value={productManufactureDate}
                      onChange={(e) => setProductManufactureDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Total batch size {usageRequired ? "(required)" : ""}
                    </label>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={totalBatchSize}
                      onChange={(e) => setTotalBatchSize(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Batch size unit {usageRequired ? "(required)" : ""}
                    </label>
                    <input
                      className="input"
                      value={batchSizeUom}
                      onChange={(e) => setBatchSizeUom(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Number of units {usageRequired ? "(required)" : ""}
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={numberOfUnits}
                      onChange={(e) => setNumberOfUnits(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="form-group">
                <label className="label">Reference (optional)</label>
                <input
                  className="input"
                  value={targetRef}
                  onChange={(e) => setTargetRef(e.target.value)}
                />
              </div>

              {!cancelledMode && (
                <div className="form-group form-group-full">
                  <label className="label">
                    Comment {consumptionType === "DESTRUCTION" ? "(required)" : "(optional)"}
                  </label>
                  <textarea
                    className="input textarea"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
              )}

              {cancelledMode && (
                <div className="form-group form-group-full">
                  <label className="label">Cancellation reason (required)</label>
                  <div className="prefixed-comment">
                    <span>Cancelled BMR:</span>
                    <textarea
                      className="input textarea"
                      value={cancellationReason}
                      onChange={(e) => setCancellationReason(e.target.value)}
                      placeholder="Add reason here"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {!cancelledMode &&
            renderStockUseSection(
              "material",
              "Materials Used",
              "Enter the receipt lot number for each material used. Add a material when more lots are required.",
              materialLines
            )}

          {!cancelledMode &&
            showBatchFields &&
            renderStockUseSection(
              "packaging",
              "Packaging Used",
              "Enter at least one packaging receipt lot and quantity. Add packaging for every additional lot or pack size used.",
              packagingLines
            )}

          {(displayComplianceProblem || (cancelledMode && inactiveProduct)) && (
            <section className="issue-compliance-panel">
              <div className="issue-batch-section-title">⚠ Batch compliance warning</div>
              {inactiveProduct && <div>The selected product is inactive.</div>}
              {!cancelledMode && missingCodes.length > 0 && (
                <div>Missing configured materials: <strong>{missingCodes.join(", ")}</strong></div>
              )}
              {!cancelledMode && unexpectedCodes.length > 0 && (
                <div>Materials not configured for this product: <strong>{unexpectedCodes.join(", ")}</strong></div>
              )}
              {canApproveRejectedBatch ? (
                <>
                  <label className="product-material-option">
                    <input
                      type="checkbox"
                      checked={approveRejected}
                      onChange={(event) => setApproveRejected(event.target.checked)}
                    />
                    Approve {cancelledMode ? "inactive-product cancellation" : "as rejected batch"}
                  </label>
                  {approveRejected && (
                    <div className="form-group">
                      <label className="label">Approval reason (required)</label>
                      <div className="prefixed-comment">
                        <span>{cancelledMode ? "Inactive product override:" : "Rejected batch:"}</span>
                        <textarea
                          className="input textarea"
                          value={cancelledMode ? inactiveOverrideReason : rejectionReason}
                          onChange={(event) => {
                            if (cancelledMode) setInactiveOverrideReason(event.target.value);
                            else setRejectionReason(event.target.value);
                          }}
                          placeholder="Add reason here"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="form-error">
                  You cannot complete this record. A senior operator with rejected-batch permission must review it.
                </div>
              )}
            </section>
          )}
        </div>

        <div className="issue-batch-footer">
          {submitError && <div className="form-error issue-submit-error">{submitError}</div>}
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={
                submitting ||
                ((displayComplianceProblem || (cancelledMode && inactiveProduct)) &&
                  !canApproveRejectedBatch)
              }
            >
              {submitting
                ? "Posting…"
                : cancelledMode
                  ? "Record Cancelled BMR"
                  : displayComplianceProblem
                    ? "Approve as rejected batch"
                    : showBatchFields
                      ? `Post consumption (${materialLines.length} material + ${packagingLines.length} packaging)`
                      : `Post consumption (${materialLines.length} line${materialLines.length === 1 ? "" : "s"})`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
