import React from "react";
import type { ConsumptionTypeCode } from "./issueHelpers";
import type { Product } from "../../../types";

type Props = {
  showBatchFields: boolean;
  isBatchRequired: boolean;

  quantityUom: string;
  qty: string;
  setQty: (v: string) => void;

  manufacturer: string;
  setManufacturer: (v: string) => void;

  esProductCode: string;
  setEsProductCode: (v: string) => void;
  products: Product[];
  productCodeLocked: boolean;

  productBatchNo: string;
  setProductBatchNo: (v: string) => void;

  productManufactureDate: string;
  setProductManufactureDate: (v: string) => void;

  totalBatchSize: string;
  setTotalBatchSize: (v: string) => void;
  batchSizeUom: string;
  setBatchSizeUom: (v: string) => void;
  numberOfUnits: string;
  setNumberOfUnits: (v: string) => void;

  consumptionType: ConsumptionTypeCode;

  comment: string;
  setComment: (v: string) => void;
  commentLocked: boolean;

  isEdit: boolean;
  editReason: string;
  setEditReason: (v: string) => void;
};

const IssueProductFields: React.FC<Props> = ({
  showBatchFields,
  isBatchRequired,
  quantityUom,
  qty,
  setQty,
  manufacturer,
  setManufacturer,
  esProductCode,
  setEsProductCode,
  products,
  productCodeLocked,
  productBatchNo,
  setProductBatchNo,
  productManufactureDate,
  setProductManufactureDate,
  totalBatchSize,
  setTotalBatchSize,
  batchSizeUom,
  setBatchSizeUom,
  numberOfUnits,
  setNumberOfUnits,
  consumptionType,
  comment,
  setComment,
  commentLocked,
  isEdit,
  editReason,
  setEditReason,
}) => {
  return (
    <>
      <div className="form-group">
        <label className="label">Quantity ({quantityUom || "uom"})</label>
        <input
          className="input"
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="e.g. 10"
        />
      </div>

      <div className="form-group">
        <label className="label">Manufacturer (info)</label>
        <input
          className="input"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          placeholder="(auto)"
        />
      </div>

      {showBatchFields && (
        <>
          <div className="form-group">
            <label className="label">
              ES product code {isBatchRequired ? "(required)" : "(optional)"}
            </label>
            <select
              className="input"
              value={esProductCode}
              onChange={(e) => setEsProductCode(e.target.value)}
              disabled={productCodeLocked}
            >
              <option value="">Select a Product List item…</option>
              {products
                .filter((product) => product.status === "ACTIVE" || product.product_code === esProductCode)
                .map((product) => (
                  <option key={product.id} value={product.product_code}>
                    {product.product_code} — {product.product_name}{product.status === "INACTIVE" ? " (inactive)" : ""}
                  </option>
                ))}
            </select>
          </div>

          <div className="form-group">
            <label className="label">
              ES batch number {isBatchRequired ? "(required)" : "(optional)"}
            </label>
            <input
              className="input"
              value={productBatchNo}
              onChange={(e) => setProductBatchNo(e.target.value)}
              placeholder="e.g. ES000123"
            />
          </div>

          <div className="form-group">
            <label className="label">
              Product manufacture date {isBatchRequired ? "(required)" : "(optional)"}
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
              Total batch size {isBatchRequired ? "(required)" : "(optional)"}
            </label>
            <input
              className="input"
              inputMode="decimal"
              value={totalBatchSize}
              onChange={(e) => setTotalBatchSize(e.target.value)}
              placeholder="e.g. 2750"
            />
          </div>

          <div className="form-group">
            <label className="label">
              Batch size unit {isBatchRequired ? "(required)" : "(optional)"}
            </label>
            <input
              className="input"
              value={batchSizeUom}
              onChange={(e) => setBatchSizeUom(e.target.value)}
              placeholder="e.g. mL, tablets, capsules"
            />
          </div>

          <div className="form-group">
            <label className="label">
              Number of units {isBatchRequired ? "(required)" : "(optional)"}
            </label>
            <input
              className="input"
              inputMode="numeric"
              value={numberOfUnits}
              onChange={(e) => setNumberOfUnits(e.target.value)}
              placeholder="e.g. 35"
            />
          </div>
        </>
      )}

      <div className="form-group form-group-full">
        <label className="label">
          Comment {consumptionType === "DESTRUCTION" ? "(required)" : ""}{" "}
          <span style={{ opacity: 0.7, fontWeight: 400 }}>
            {isEdit ? "(optional)" : "(optional unless destruction)"}
          </span>
        </label>
        <textarea
          className="input textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={commentLocked}
          placeholder="Optional unless destruction…"
        />
      </div>

      {isEdit && (
        <div className="form-group form-group-full">
          <label className="label">
            Edit reason <span style={{ color: "#fca5a5" }}>(required)</span>
          </label>
          <textarea
            className="input textarea"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="Explain what changed and why (audit trail)…"
          />
        </div>
      )}
    </>
  );
};

export default IssueProductFields;
