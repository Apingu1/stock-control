import React, { useEffect, useState } from "react";

export type CsvExportParams = {
  fromDate: string | null;
  toDate: string | null;
  respectFilters: boolean;
};

type CsvExportModalProps = {
  open: boolean;
  title: string;
  helpText?: string;
  fromLabel?: string;
  toLabel?: string;
  defaultRespectFilters?: boolean;
  onClose: () => void;
  onConfirm: (params: CsvExportParams) => void;
};

const CsvExportModal: React.FC<CsvExportModalProps> = ({
  open,
  title,
  helpText,
  fromLabel = "From date (optional)",
  toLabel = "To date (optional)",
  defaultRespectFilters = true,
  onClose,
  onConfirm,
}) => {
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [respectFilters, setRespectFilters] = useState<boolean>(
    defaultRespectFilters
  );

  // Reset fields whenever the modal is opened
  useEffect(() => {
    if (open) {
      setFromDate("");
      setToDate("");
      setRespectFilters(defaultRespectFilters);
    }
  }, [open, defaultRespectFilters]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm({
      fromDate: fromDate || null,
      toDate: toDate || null,
      respectFilters,
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
        </div>
        <div className="modal-body">
          {helpText && <p style={{ marginBottom: 12 }}>{helpText}</p>}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <label className="field">
              <span className="field-label">{fromLabel}</span>
              <input
                type="date"
                className="input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{toLabel}</span>
              <input
                type="date"
                className="input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>
          </div>

          <label
            className="field"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <input
              type="checkbox"
              checked={respectFilters}
              onChange={(e) => setRespectFilters(e.target.checked)}
            />
            <span>Limit to current search and dropdown filters</span>
          </label>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="button" onClick={handleConfirm}>
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default CsvExportModal;
