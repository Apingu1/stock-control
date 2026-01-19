import React from "react";
import type { ApprovedManufacturer } from "../../../types";

type Props = {
  supplier: string;
  setSupplier: (v: string) => void;

  manufacturer: string;
  setManufacturer: (v: string) => void;

  isTabletsCaps: boolean;
  hasApproved: boolean;
  approvedForMaterial: ApprovedManufacturer[];
};

const ReceiptManufacturerFields: React.FC<Props> = ({
  supplier,
  setSupplier,
  manufacturer,
  setManufacturer,
  isTabletsCaps,
  hasApproved,
  approvedForMaterial,
}) => {
  return (
    <>
      <div className="form-group">
        <label className="label">Supplier (optional)</label>
        <input
          className="input"
          placeholder="e.g. Supplier Ltd"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label className="label">
          Manufacturer {isTabletsCaps ? "(approved only)" : "(optional)"}
        </label>

        {isTabletsCaps ? (
          <>
            <select
              className="input"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              disabled={!hasApproved}
            >
              <option value="">Select…</option>
              {approvedForMaterial.map((am) => (
                <option key={am.id} value={am.manufacturer_name}>
                  {am.manufacturer_name}
                </option>
              ))}
            </select>

            {!hasApproved && (
              <div className="info-row" style={{ marginTop: 6 }}>
                No approved manufacturers configured. Add one in Materials before booking in.
              </div>
            )}
          </>
        ) : (
          <input
            className="input"
            placeholder="e.g. Manufacturer Ltd"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
          />
        )}
      </div>
    </>
  );
};

export default ReceiptManufacturerFields;
