export const MATERIAL_CATEGORY_OPTIONS: string[] = [
  "SOLID_RAW_MAT",
  "LIQUID_RAW_MAT",
  "TABLETS_CAPSULES",
  "CREAMS_OINTMENTS",
  "AMPOULES",
  "PACKAGING",
  "NA",
];

export const MATERIAL_TYPE_OPTIONS: string[] = [
  "API",
  "LICENSED FP",
  "EXCIPIENT",
  "PACKAGING",
  "OTHER",
];

export const MATERIAL_UOM_OPTIONS: string[] = [
  "G",
  "KG",
  "MG",
  "ML",
  "L",
  "TAB",
  "CAP",
  "AMP",
  "NA",
];

export type ConsumptionTypeCode =
  | "USAGE"
  | "WASTAGE"
  | "DESTRUCTION"
  | "R_AND_D";

export const CONSUMPTION_TYPES: {
  code: ConsumptionTypeCode;
  label: string;
}[] = [
  { code: "USAGE", label: "Usage" },
  { code: "WASTAGE", label: "Wastage" },
  { code: "DESTRUCTION", label: "Destruction" },
  { code: "R_AND_D", label: "R&D" },
];
