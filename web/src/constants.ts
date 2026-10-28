export const MATERIAL_CATEGORY_OPTIONS: string[] = [
  "SOLID_RAW_MAT",
  "LIQUID_RAW_MAT",
  "TABLETS_CAPSULES",
  "CREAMS_OINTMENTS",
  "AMPOULES",
  "PACKAGING",
];

export const MATERIAL_TYPE_OPTIONS: string[] = [
  "API",
  "LICENSED FP",
  "EXCIPIENT",
  "NA", // Reserved for the automatically classified Packaging category.
];

export const MATERIAL_CATEGORY_TYPES: Record<string, string[]> = {
  SOLID_RAW_MAT: ["API", "EXCIPIENT"],
  LIQUID_RAW_MAT: ["API", "LICENSED FP", "EXCIPIENT"],
  TABLETS_CAPSULES: ["LICENSED FP"],
  CREAMS_OINTMENTS: ["LICENSED FP", "EXCIPIENT"],
  AMPOULES: ["API", "LICENSED FP", "EXCIPIENT"],
  PACKAGING: ["NA"],
};

export const BATCH_SIZE_UOM_OPTIONS = ["mL", "L", "g", "mg", "Tabs", "Caps"] as const;

export const MATERIAL_UOM_OPTIONS: string[] = [
  "G",
  "MG",
  "ML",
  "L",
  "TAB",
  "CAP",
  "AMP",
  "UNIT",
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
