import { useState } from "react";
import OpeningStockMigrationPanel from "./OpeningStockMigrationPanel";
import BMRProductMigrationPanel from "./BMRProductMigrationPanel";
import MaterialsLibraryMigrationPanel from "./MaterialsLibraryMigrationPanel";

/** Each stage is isolated: materials, BMR products/formulas, and stock ledger. */
export default function DataMigrationView({ canCommit }: { canCommit: boolean }) {
  const [tab, setTab] = useState<"materials" | "bmr" | "stock">("materials");
  return (
    <>
      <div className="stkflo-migration-switch" role="tablist" aria-label="Data migration type"
        style={{ display:"flex", gap:8, flexWrap:"wrap", margin:"0 0 12px" }}>
        <button type="button" role="tab" aria-selected={tab === "materials"}
          className={tab === "materials" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setTab("materials")}>Materials Library</button>
        <button type="button" role="tab" aria-selected={tab === "bmr"}
          className={tab === "bmr" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setTab("bmr")}>Products &amp; Master Formulas</button>
        <button type="button" role="tab" aria-selected={tab === "stock"}
          className={tab === "stock" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setTab("stock")}>Opening Stock</button>
      </div>
      {tab === "materials"
        ? <MaterialsLibraryMigrationPanel canCommit={canCommit} />
        : tab === "bmr"
          ? <BMRProductMigrationPanel canCommit={canCommit} />
          : <OpeningStockMigrationPanel canCommit={canCommit} />}
    </>
  );
}
