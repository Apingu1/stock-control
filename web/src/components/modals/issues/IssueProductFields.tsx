import React from "react";
import type { ConsumptionTypeCode } from "./issueHelpers";

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

  productBatchNo: string;
  setProductBatchNo: (v: string) => void;

  productManufactureDate: string;
  setProductManufactureDate: (v: string) => void;

  consumptionType: ConsumptionTypeCode;

  comment: string;
  setComment: (v: string) => void;

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
  productBatchNo,
  setProductBatchNo,
  productManufactureDate,
  setProductManufactureDate,
  consumptionType,
  comment,
  setComment,
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
            <label className="label">ES product code</label>
            <input
              className="input"
              value={esProductCode}
              onChange={(e) => setEsProductCode(e.target.value)}
              placeholder="e.g. DULO2"
            />
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
            <label className="label">Product manufacture date</label>
            <input
              className="input"
              type="date"
              value={productManufactureDate}
              onChange={(e) => setProductManufactureDate(e.target.value)}
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
