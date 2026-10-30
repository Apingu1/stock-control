import { useState } from "react";
import OpeningStockMigrationPanel from "./OpeningStockMigrationPanel";
import BMRProductMigrationPanel from "./BMRProductMigrationPanel";

/** Keeps existing opening-stock import isolated from Product/BMR reference data. */
export default function DataMigrationView({ canCommit }: { canCommit: boolean }) {
  const [tab, setTab] = useState<"bmr" | "stock">("bmr");
  return (
    <>
      <div className="stkflo-migration-switch" role="tablist" aria-label="Data migration type"
        style={{ display:"flex", gap:8, flexWrap:"wrap", margin:"0 0 12px" }}>
        <button type="button" role="tab" aria-selected={tab === "bmr"}
          className={tab === "bmr" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setTab("bmr")}>Products & Master Formulas</button>
        <button type="button" role="tab" aria-selected={tab === "stock"}
          className={tab === "stock" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setTab("stock")}>Opening Stock</button>
      </div>
      {tab === "bmr"
        ? <BMRProductMigrationPanel canCommit={canCommit} />
        : <OpeningStockMigrationPanel canCommit={canCommit} />}
    </>
  );
}
