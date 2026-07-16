import React, { useEffect, useMemo, useState } from "react";
import type { LotBalance } from "../../types";
import { CONSUMPTION_TYPES } from "../../constants";
import { apiFetch } from "../../utils/api";
import type { ConsumptionTypeCode } from "./issues/issueHelpers";
import { formatDateShort, rankLotStatus } from "./issues/issueHelpers";

type MaterialLine = {
  clientId: string;
  lotSearch: string;
  selectedLot: LotBalance | null;
  qty: string;
  error: string | null;
};

type QuarantinePolicyResponse = {
  allow_issue_from_quarantine: boolean;
};

const newLine = (): MaterialLine => ({
  clientId: `material-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  lotSearch: "",
  selectedLot: null,
  qty: "",
  error: null,
});

const displayQty = (value: number | string) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-GB", { maximumFractionDigits: 6 });
};

const apiErrorMessage = (err: unknown) => {
  const raw = err instanceof Error ? err.message : "Failed to post consumption";
  const jsonStart = raw.indexOf('{"detail"');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as { detail?: string };
      if (parsed.detail) return parsed.detail;
    } catch {
      // Keep the original message when a proxy returns non-JSON text.
    }
  }
  return raw;
};

export default function BatchIssueCreateModal({
  open,
  onClose,
  onIssuePosted,
  lotBalances,
  createdBy,
}: {
  open: boolean;
  onClose: () => void;
  onIssuePosted: () => void;
  lotBalances: LotBalance[];
  createdBy: string;
}) {
  const [consumptionType, setConsumptionType] = useState<ConsumptionTypeCode>("USAGE");
  const [esProductCode, setEsProductCode] = useState("");
  const [productBatchNo, setProductBatchNo] = useState("");
  const [productManufactureDate, setProductManufactureDate] = useState("");
  const [packSizeValue, setPackSizeValue] = useState("");
  const [packSizeUom, setPackSizeUom] = useState("");
  const [packQuantity, setPackQuantity] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<MaterialLine[]>([newLine()]);
  const [allowQuarantine, setAllowQuarantine] = useState<boolean | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectableLots = useMemo(
    () =>
      lotBalances
        .filter((lot) => Number(lot.balance_qty) > 0)
        .sort((a, b) => {
          const byStatus = rankLotStatus(a.status) - rankLotStatus(b.status);
          if (byStatus !== 0) return byStatus;
          return a.lot_number.localeCompare(b.lot_number);
        }),
    [lotBalances]
  );

  useEffect(() => {
    if (!open) return;
    setConsumptionType("USAGE");
    setEsProductCode("");
    setProductBatchNo("");
    setProductManufactureDate("");
    setPackSizeValue("");
    setPackSizeUom("");
    setPackQuantity("");
    setComment("");
    setLines([newLine()]);
    setSubmitError(null);
    setPolicyError(null);
    setAllowQuarantine(null);

    void (async () => {
      try {
        const res = await apiFetch("/quarantine/policy");
        const policy = (await res.json()) as QuarantinePolicyResponse;
        setAllowQuarantine(Boolean(policy.allow_issue_from_quarantine));
      } catch {
        // The backend remains authoritative. Until the policy can be read, do
        // not allow a quarantined lot to be selected in the operator UI.
        setAllowQuarantine(false);
        setPolicyError(
          "Quarantine policy could not be checked. Quarantined lots are disabled for this submission."
        );
      }
    })();
  }, [open]);

  if (!open) return null;

  const showBatchFields = consumptionType === "USAGE" || consumptionType === "R_AND_D";
  const usageRequired = consumptionType === "USAGE";

  const blockedReason = (lot: LotBalance): string | null => {
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

  const updateLine = (clientId: string, patch: Partial<MaterialLine>) => {
    setLines((current) =>
      current.map((line) => (line.clientId === clientId ? { ...line, ...patch } : line))
    );
  };

  const suggestionsFor = (line: MaterialLine) => {
    const query = line.lotSearch.trim().toLowerCase();
    if (!query || line.selectedLot) return [];
    return selectableLots
      .filter(
        (lot) =>
          lot.lot_number.toLowerCase().includes(query) ||
          lot.material_code.toLowerCase().includes(query) ||
          lot.material_name.toLowerCase().includes(query)
      )
      .slice(0, 15);
  };

  const selectLot = (line: MaterialLine, lot: LotBalance) => {
    const blocked = blockedReason(lot);
    if (blocked) {
      updateLine(line.clientId, { error: blocked });
      return;
    }

    const duplicate = lines.some(
      (other) =>
        other.clientId !== line.clientId &&
        other.selectedLot?.material_lot_id === lot.material_lot_id
    );
    if (duplicate) {
      updateLine(line.clientId, {
        error: "This exact lot segment is already included in the consumption.",
      });
      return;
    }

    updateLine(line.clientId, {
      selectedLot: lot,
      lotSearch: lot.lot_number,
      qty: "",
      error: null,
    });
  };

  const validate = () => {
    if (!createdBy.trim()) {
      setSubmitError("Not signed in. Please re-login.");
      return false;
    }

    if (usageRequired) {
      if (!esProductCode.trim()) {
        setSubmitError("Please enter the ES product code for Usage.");
        return false;
      }
      if (!productBatchNo.trim()) {
        setSubmitError("Please enter the ES batch number for Usage.");
        return false;
      }
      if (!productManufactureDate) {
        setSubmitError("Please enter the product manufacture date for Usage.");
        return false;
      }
      if (!(Number(packSizeValue) > 0) || !packSizeUom.trim()) {
        setSubmitError("Please enter a valid pack size and pack size unit for Usage.");
        return false;
      }
      if (!Number.isInteger(Number(packQuantity)) || Number(packQuantity) <= 0) {
        setSubmitError("Please enter a whole-number pack quantity greater than zero.");
        return false;
      }
    }

    if (consumptionType === "DESTRUCTION" && !comment.trim()) {
      setSubmitError("Please enter a comment explaining the destruction of stock.");
      return false;
    }

    let valid = true;
    const seenLotIds = new Set<number>();
    const checkedLines = lines.map((line, index) => {
      let error: string | null = null;
      if (!line.selectedLot) {
        error = `Material ${index + 1}: select a lot.`;
      } else if (seenLotIds.has(line.selectedLot.material_lot_id)) {
        error = `Material ${index + 1}: this exact lot segment is already included.`;
      } else {
        seenLotIds.add(line.selectedLot.material_lot_id);
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          error = `Material ${index + 1}: enter a quantity greater than zero.`;
        } else if (qty > Number(line.selectedLot.balance_qty)) {
          error =
            `Material ${index + 1}: insufficient stock ` +
            `(available ${displayQty(line.selectedLot.balance_qty)} ${line.selectedLot.uom_code}).`;
        }
      }
      if (error) valid = false;
      return { ...line, error };
    });
    setLines(checkedLines);

    if (!valid) setSubmitError("Please correct the highlighted material entries.");
    return valid;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const batchRelevant = showBatchFields;
      const payload = {
        consumption_type: consumptionType,
        es_product_code: batchRelevant ? esProductCode.trim() || null : null,
        product_batch_no: batchRelevant ? productBatchNo.trim() || null : null,
        product_manufacture_date: batchRelevant ? productManufactureDate || null : null,
        pack_size_value: batchRelevant && packSizeValue ? Number(packSizeValue) : null,
        pack_size_uom: batchRelevant ? packSizeUom.trim() || null : null,
        pack_quantity: batchRelevant && packQuantity ? Number(packQuantity) : null,
        comment: comment.trim() || null,
        target_ref: null,
        items: lines.map((line) => ({
          material_code: line.selectedLot!.material_code,
          lot_number: line.selectedLot!.lot_number,
          material_lot_id: line.selectedLot!.material_lot_id,
          qty: Number(line.qty),
          uom_code: line.selectedLot!.uom_code,
        })),
      };

      await apiFetch("/issues/batch", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onIssuePosted();
      onClose();
    } catch (err) {
      setSubmitError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <form className="modal issue-batch-modal" onSubmit={handleSubmit}>
        <div className="modal-header issue-batch-header">
          <div>
            <div className="modal-title">New Consumption</div>
            <div className="modal-subtitle">
              Enter the shared batch details once, then add every material used.
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} disabled={submitting}>
            ✕
          </button>
        </div>

        <div className="issue-batch-scroll">
          <section className="issue-batch-section">
            <div className="issue-batch-section-heading">
              <div>
                <div className="issue-batch-section-title">Batch details</div>
                <div className="issue-batch-section-help">Applied to every material below.</div>
              </div>
            </div>

            <div className="form-grid issue-batch-details-grid">
              <div className="form-group">
                <label className="label">Consumption type</label>
                <select
                  className="input"
                  value={consumptionType}
                  onChange={(event) =>
                    setConsumptionType(event.target.value as ConsumptionTypeCode)
                  }
                >
                  {CONSUMPTION_TYPES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {showBatchFields && (
                <>
                  <div className="form-group">
                    <label className="label">
                      ES product code {usageRequired ? "(required)" : "(optional)"}
                    </label>
                    <input
                      className="input"
                      value={esProductCode}
                      onChange={(event) => setEsProductCode(event.target.value)}
                      placeholder="e.g. DULO2"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">
                      ES batch number {usageRequired ? "(required)" : "(optional)"}
                    </label>
                    <input
                      className="input"
                      value={productBatchNo}
                      onChange={(event) => setProductBatchNo(event.target.value)}
                      placeholder="e.g. ES000123"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Product manufacture date {usageRequired ? "(required)" : "(optional)"}
                    </label>
                    <input
                      className="input"
                      type="date"
                      value={productManufactureDate}
                      onChange={(event) => setProductManufactureDate(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Pack size {usageRequired ? "(required)" : "(optional)"}
                    </label>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={packSizeValue}
                      onChange={(event) => setPackSizeValue(event.target.value)}
                      placeholder="e.g. 100"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Pack size unit {usageRequired ? "(required)" : "(optional)"}
                    </label>
                    <input
                      className="input"
                      list="pack-size-uom-options"
                      value={packSizeUom}
                      onChange={(event) => setPackSizeUom(event.target.value)}
                      placeholder="e.g. mL, tablets, capsules"
                    />
                    <datalist id="pack-size-uom-options">
                      <option value="mL" />
                      <option value="L" />
                      <option value="g" />
                      <option value="tablets" />
                      <option value="capsules" />
                      <option value="sachets" />
                      <option value="ampoules" />
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="label">
                      Pack quantity {usageRequired ? "(required)" : "(optional)"}
                    </label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={packQuantity}
                      onChange={(event) => setPackQuantity(event.target.value)}
                      placeholder="e.g. 50"
                    />
                  </div>
                </>
              )}

              <div className="form-group form-group-full">
                <label className="label">
                  Comment {consumptionType === "DESTRUCTION" ? "(required)" : "(optional)"}
                </label>
                <textarea
                  className="input textarea"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Shared batch or consumption comment…"
                />
              </div>
            </div>
          </section>

          <section className="issue-batch-section">
            <div className="issue-batch-section-heading">
              <div>
                <div className="issue-batch-section-title">Materials used</div>
                <div className="issue-batch-section-help">
                  Search by lot number and select the exact stock segment.
                </div>
              </div>
              <span className="issue-material-count">
                {lines.length} material{lines.length === 1 ? "" : "s"}
              </span>
            </div>

            {policyError && <div className="issue-policy-warning">{policyError}</div>}

            <div className="issue-material-list">
              {lines.map((line, index) => {
                const suggestions = suggestionsFor(line);
                const lot = line.selectedLot;
                const status = (lot?.status || "").toUpperCase();
                return (
                  <div className="issue-material-card" key={line.clientId}>
                    <div className="issue-material-card-header">
                      <div className="issue-material-number">Material {index + 1}</div>
                      {lines.length > 1 && (
                        <button
                          className="btn btn-ghost issue-remove-material"
                          type="button"
                          onClick={() =>
                            setLines((current) =>
                              current.filter((item) => item.clientId !== line.clientId)
                            )
                          }
                          disabled={submitting}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="issue-material-grid">
                      <div className="form-group issue-lot-search-group">
                        <label className="label">Material lot number</label>
                        <div className="typeahead-wrap">
                          <input
                            className="input"
                            value={line.lotSearch}
                            onChange={(event) =>
                              updateLine(line.clientId, {
                                lotSearch: event.target.value,
                                selectedLot: null,
                                qty: "",
                                error: null,
                              })
                            }
                            placeholder="Start typing the lot number…"
                            autoComplete="off"
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
                                    onClick={() => selectLot(line, suggestion)}
                                    disabled={Boolean(blocked)}
                                  >
                                    <div className="typeahead-main">
                                      {suggestion.lot_number} — {suggestion.material_name} (
                                      {suggestion.material_code})
                                    </div>
                                    <div className="typeahead-meta">
                                      EXP {formatDateShort(suggestion.expiry_date)} •{" "}
                                      {(suggestion.status || "—").toUpperCase()} •{" "}
                                      {displayQty(suggestion.balance_qty)} {suggestion.uom_code}
                                      {blocked ? ` • BLOCKED: ${blocked}` : ""}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="form-group issue-qty-group">
                        <label className="label">
                          Quantity used {lot ? `(${lot.uom_code})` : ""}
                        </label>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={line.qty}
                          onChange={(event) =>
                            updateLine(line.clientId, { qty: event.target.value, error: null })
                          }
                          disabled={!lot}
                          placeholder="e.g. 10"
                        />
                      </div>
                    </div>

                    {lot && (
                      <div className="issue-selected-lot">
                        <div>
                          <span>Material</span>
                          <strong>{lot.material_name}</strong>
                          <small>{lot.material_code}</small>
                        </div>
                        <div>
                          <span>Expiry</span>
                          <strong>{formatDateShort(lot.expiry_date)}</strong>
                        </div>
                        <div>
                          <span>Status</span>
                          <strong className={`issue-status issue-status-${status.toLowerCase()}`}>
                            {status || "—"}
                          </strong>
                        </div>
                        <div>
                          <span>Available</span>
                          <strong>
                            {displayQty(lot.balance_qty)} {lot.uom_code}
                          </strong>
                        </div>
                        <div>
                          <span>Manufacturer</span>
                          <strong>{lot.manufacturer || "—"}</strong>
                        </div>
                      </div>
                    )}

                    {status === "QUARANTINE" && allowQuarantine && (
                      <div className="issue-quarantine-warning">
                        <strong>Warning:</strong> This material is quarantined. The policy is warn-only;
                        obtain QA approval prior to use and escalate if it has already been used.
                      </div>
                    )}

                    {line.error && <div className="form-error issue-line-error">{line.error}</div>}
                  </div>
                );
              })}
            </div>

            <button
              className="btn issue-add-material"
              type="button"
              onClick={() => setLines((current) => [...current, newLine()])}
              disabled={submitting}
            >
              + Add material
            </button>
          </section>
        </div>

        <div className="issue-batch-footer">
          {submitError && <div className="form-error issue-submit-error">{submitError}</div>}
          <div className="modal-footer">
            <button className="btn-muted" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting
                ? "Posting all materials…"
                : `Post consumption (${lines.length} material${lines.length === 1 ? "" : "s"})`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
