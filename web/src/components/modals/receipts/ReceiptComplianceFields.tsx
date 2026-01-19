import React from "react";

type Props = {
  isEdit: boolean;

  compliesEs: boolean;
  setCompliesEs: (v: boolean) => void;

  editReason: string;
  setEditReason: (v: string) => void;
};

const ReceiptComplianceFields: React.FC<Props> = ({
  isEdit,
  compliesEs,
  setCompliesEs,
  editReason,
  setEditReason,
}) => {
  if (!isEdit) {
    return (
      <div className="form-group" style={{ gridColumn: "1 / -1" }}>
        <label className="label">Compliance check</label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={compliesEs}
            onChange={(e) => setCompliesEs(e.target.checked)}
          />
          <span>Goods in comply with ES criteria specified in ES.SOP.112</span>
        </label>
      </div>
    );
  }

  return (
    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
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
  );
};

export default ReceiptComplianceFields;
