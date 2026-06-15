// Run the whole Certz walkthrough in order, stopping if any step fails.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const steps = [
  "step-1-ca-key-in-tee.mjs",
  "step-2-build-tbs.mjs",
  "step-3-request-challenge.mjs",
  "step-4-dns01-challenge.mjs",
  "step-5-fulfill-and-sign.mjs",
  "step-6-assemble-x509.mjs",
  "step-7-verify-chain.mjs",
  "step-8-onchain-registry.mjs",
  "step-9-proof-of-possession.mjs",
];

for (const step of steps) {
  const r = spawnSync("node", [join(here, step)], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n\u2717 ${step} failed (exit ${r.status}). Stopping.`);
    process.exit(r.status ?? 1);
  }
}
console.log("\n\u2713 All steps complete. You issued and verified a real Certz certificate end to end.\n");
