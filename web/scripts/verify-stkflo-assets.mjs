import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Prevent a production build with missing or substituted approved brand art.
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const approved = {
  "public/branding/stkflo-horizontal.svg": "4e141cd0ca30dd532e417356704c1d58cdd283ee6f96c0e581135d4dfe974f50",
  "public/branding/stkflo-monogram.svg": "53ea0b0a2baf1e365d4f192a57f2a6d004e45ed850d654ec25e7117664df6244",
  "public/icons/stkflo-32.png": "7223f778d223b82bb13ffc318cea61296f04c5021e85188f0390576560b30625",
  "public/icons/stkflo-192.png": "f3c3ba95f54048d8ac6ddc87b4df091cbf2a31512e598a789fcc56275c709543",
  "public/icons/stkflo-512.png": "24f4c4eb421a44ec3e962ad1d6334b761b171605330b38783a787f8c70a0abec",
  "public/icons/stkflo-maskable-512.png": "8c7b581a733b1038f612ccf187d81e3c5a28efbc50534d01412ba9850293c28c",
  "public/icons/stkflo-apple-touch.png": "2f54a17536596d07b9966b47add61ae5c08f437eb7d4d9a75977fa22a639b35f",
  "public/icons/stkflo-favicon.ico": "90329731e1684306adb61b320388537d54c814e1f5a14269679279cd4be28896",
};

let failed = false;
for (const [relative, expected] of Object.entries(approved)) {
  const path = resolve(webRoot, relative);
  if (!existsSync(path)) {
    console.error("MISSING approved StkFlo asset:", relative);
    failed = true;
    continue;
  }
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (digest !== expected) {
    console.error("INVALID StkFlo artwork checksum:", relative);
    failed = true;
  }
}
if (failed) {
  console.error("\nInstall the exact approved artwork before building:");
  console.error('  bash scripts/install_stkflo_branding.sh "/path/to/StkFlo_COMPLETE_Logo_and_Branding_Package.zip"');
  process.exitCode = 1;
} else {
  console.log("StkFlo branding validated: 8 approved assets present and unchanged.");
}
