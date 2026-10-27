import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Required approved StkFlo premium artwork. Fails closed if not installed or altered.
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const approved = {
  "public/branding/stkflo-horizontal.svg": "eae79cd0ebd72742eea34186557113ba91903b2cd95adf942fb3b4aa13965c2e",
  "public/branding/stkflo-compact.svg": "eedaa30689013da22695355920798fa25f30c2745987a5eaba1552eed42c1938",
  "public/branding/stkflo-monogram.svg": "624dc863e2b417a8bd84d59b6c6b223d3c4ca83b55ea1555f084721b87e49af5",
  "public/icons/stkflo-32.png": "4bc2fbc884b55c5beaf3c716221119cbb3beeac156df36021a464c13e282de69",
  "public/icons/stkflo-192.png": "68e58c30dcc096e14bc110135b8ec7e49f46dc0b443d6537b1a03357c05bcd95",
  "public/icons/stkflo-512.png": "9adf7ba98ed678f4688631f1f592c5fc08daa6550f7adca99f36bd385b0f126b",
  "public/icons/stkflo-maskable-512.png": "9349065e687d520e96b70f4f7c910b37b7c7e4c95218c5d8fd8896573ee96143",
  "public/icons/stkflo-apple-touch.png": "482ae07618dc519406ccfb455370b305ef6f97cc9887dee52ac5ca43fd7ab9f1",
  "public/icons/stkflo-favicon.ico": "f96719be61b5948ea344b7ef661861cda6918b14175034b48f812c028d544903",
};
let failed = false;
for (const [relative, expected] of Object.entries(approved)) {
  const path = resolve(webRoot, relative);
  if (!existsSync(path)) {
    console.error("MISSING StkFlo approved image:", relative);
    failed = true;
    continue;
  }
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) {
    console.error("CHANGED StkFlo approved image:", relative);
    failed = true;
  }
}
if (failed) {
  console.error("Install the regenerated high-quality artwork using:");
  console.error('  bash scripts/install_stkflo_branding.sh "/workspaces/stock-control/StkFlo_High_Quality_Complete_Logo_Icon_Pack"');
  process.exitCode = 1;
} else {
  console.log("Verified all 9 approved high-quality StkFlo brand assets.");
}
