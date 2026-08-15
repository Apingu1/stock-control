import { useEffect, useMemo, useState } from "react";
import type { LotBalance, Product } from "../../types";
import { CONSUMPTION_TYPES } from "../../constants";
import { apiFetch } from "../../utils/api";
import { useBackgroundRefresh } from "../../hooks/useBackgroundRefresh";
import type { ConsumptionTypeCode } from "./issues/issueHelpers";
import { formatDateShort, rankLotStatus } from "./issues/issueHelpers";

type MaterialLine = {
  clientId: string;
  lotSearch: string;
  selectedLot: LotBalance | null;
  qty: string;
  error: string | null;
};

const newLine = (): MaterialLine => ({
  clientId: `material-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  lotSearch: "",
  selectedLot: null,
  qty: "",
  error: null,
});

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
  const [lines, setLines] = useState<MaterialLine[]>([newLine()]);
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

  const expectedCodes = useMemo(
    () => new Set(selectedProduct?.materials.map((material) => material.material_code) || []),
    [selectedProduct]
  );
  const actualCodes = useMemo(
    () => new Set(lines.flatMap((line) => (line.selectedLot ? [line.selectedLot.material_code] : []))),
    [lines]
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
    setLines([newLine()]);
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
    setLines((current) => {
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
    });
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
    if (!cancelledMode) setLines([newLine()]);
  };

  const toggleCancelledMode = () => {
    const nextCancelledMode = !cancelledMode;
    setCancelledMode(nextCancelledMode);
    setApproveRejected(false);
    setRejectionReason("");
    setInactiveOverrideReason("");
    setSubmitError(null);
    setComplianceReviewed(false);
    setLines([newLine()]);
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

  const updateLine = (id: string, patch: Partial<MaterialLine>) => {
    setComplianceReviewed(false);
    setApproveRejected(false);
    setRejectionReason("");
    setLines((current) =>
      current.map((line) => (line.clientId === id ? { ...line, ...patch } : line))
    );
  };

  const suggestionsFor = (line: MaterialLine) => {
    if (!line.lotSearch.trim() || line.selectedLot) return [];
    const query = line.lotSearch.trim().toLowerCase();
    return selectableLots
      .filter((lot) => lot.lot_number.toLowerCase().includes(query))
      .slice(0, 18);
  };

  const selectLot = (line: MaterialLine, lot: LotBalance) => {
    const blocked = blockedReason(lot);
    if (blocked) return updateLine(line.clientId, { error: blocked });
    if (
      lines.some(
        (other) =>
          other.clientId !== line.clientId &&
          other.selectedLot?.material_lot_id === lot.material_lot_id
      )
    ) {
      return updateLine(line.clientId, {
        error: "This exact lot segment is already included.",
      });
    }
    updateLine(line.clientId, {
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
    setLines((current) =>
      current.map((line, index) => {
        let error: string | null = null;
        if (!line.selectedLot) error = `Lot entry ${index + 1}: select a lot.`;
        else if (seen.has(line.selectedLot.material_lot_id)) {
          error = `Lot entry ${index + 1}: duplicate lot segment.`;
        } else {
          seen.add(line.selectedLot.material_lot_id);
          const quantity = Number(line.qty);
          if (!Number.isFinite(quantity) || quantity <= 0) {
            error = `Lot entry ${index + 1}: enter a quantity greater than zero.`;
          } else if (quantity > Number(line.selectedLot.balance_qty)) {
            error = `Lot entry ${index + 1}: insufficient stock.`;
          }
        }
        if (error) valid = false;
        return { ...line, error };
      })
    );
    if (!valid) {
      setSubmitError("Correct the highlighted material entries.");
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
            items: lines.map((line) => ({
              material_code: line.selectedLot!.material_code,
              lot_number: line.selectedLot!.lot_number,
              material_lot_id: line.selectedLot!.material_lot_id,
              qty: Number(line.qty),
              uom_code: line.selectedLot!.uom_code,
            })),
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
                : "Select a Product List item and enter every material actually used."}
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

          {!cancelledMode && (
            <section className="issue-batch-section">
              <div className="issue-batch-section-heading">
                <div>
                  <div className="issue-batch-section-title">Materials actually used</div>
                  <div className="issue-batch-section-help">
                    Enter the receipt lot number for each material actually used. Add another row
                    when more lots are required.
                  </div>
                </div>
                <span className="issue-material-count">
                  {lines.length} line{lines.length === 1 ? "" : "s"}
                </span>
              </div>
              {policyError && <div className="issue-policy-warning">{policyError}</div>}
              <div className="issue-material-list">
                {lines.map((line, index) => {
                  const lot = line.selectedLot;
                  const suggestions = suggestionsFor(line);
                  const unexpected = Boolean(
                    complianceReviewed && lot && productControlsApply && !expectedCodes.has(lot.material_code)
                  );
                  return (
                    <div
                      className={`issue-material-card ${unexpected ? "issue-material-noncompliant" : ""}`}
                      key={line.clientId}
                    >
                      <div className="issue-material-card-header">
                        <div className="issue-material-number">
                          Lot entry {index + 1}
                        </div>
                        {lines.length > 1 && (
                          <button
                            className="btn btn-ghost issue-remove-material"
                            type="button"
                            onClick={() => {
                              setComplianceReviewed(false);
                              setApproveRejected(false);
                              setRejectionReason("");
                              setLines((current) =>
                                current.filter((item) => item.clientId !== line.clientId)
                              );
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
                              onChange={(e) =>
                                updateLine(line.clientId, {
                                  lotSearch: e.target.value,
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
                                      className={`typeahead-option ${blocked ? "is-disabled" : ""}`}
                                      disabled={Boolean(blocked)}
                                      onClick={() => selectLot(line, suggestion)}
                                    >
                                      <div className="typeahead-main">
                                        {suggestion.lot_number} — {suggestion.material_name} ({suggestion.material_code})
                                      </div>
                                      <div className="typeahead-meta">
                                        EXP {formatDateShort(suggestion.expiry_date)} • {suggestion.status} • {displayQty(suggestion.balance_qty)} {suggestion.uom_code}
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
                            onChange={(e) =>
                              updateLine(line.clientId, {
                                qty: e.target.value,
                                error: null,
                              })
                            }
                          />
                        </div>
                      </div>

                      {lot && (
                        <div className="issue-selected-lot">
                          <div><span>Material</span><strong>{lot.material_name}</strong><small>{lot.material_code}</small></div>
                          <div><span>Lot</span><strong>{lot.lot_number}</strong></div>
                          <div><span>Expiry</span><strong>{formatDateShort(lot.expiry_date)}</strong></div>
                          <div><span>Status</span><strong>{lot.status}</strong></div>
                          <div><span>Available</span><strong>{displayQty(lot.balance_qty)} {lot.uom_code}</strong></div>
                        </div>
                      )}

                      {unexpected && (
                        <div className="issue-quarantine-warning">
                          <strong>Incorrect material:</strong> {lot!.material_code} is not configured for {selectedProduct!.product_code}.
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
                  setLines((current) => [...current, newLine()]);
                }}
              >
                ＋ Add another lot
              </button>
            </section>
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
                    : `Post consumption (${lines.length} line${lines.length === 1 ? "" : "s"})`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
