// STEP 06 — Verify the certificate chain (Certz SDK + an independent OpenSSL check).
//
// Run:  npm run 06     (local; uses outputs from steps 02 + 05)
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  title, teach, section, kv, pass, fail, OUT, loadJson, loadArtifact, sdk,
} from "./_lib.mjs";

title("06", "Verify the chain: is this cert really signed by the Certz CA?");

teach(`
"Verifying a chain" means checking a few independent things:
  1. The leaf certificate's signature was made by the CA's private key — provable
     using only the CA's PUBLIC key (the trust anchor from step 02).
  2. The CA root is a self-signed CA (its BasicConstraints say cA=true).
  3. The leaf is inside its validity window (not expired / not yet valid).
  4. The domain you're visiting appears in the cert's Subject Alternative Names.

We'll run the Certz SDK's verifier, then re-check with OpenSSL — a completely
independent, battle-tested implementation — to prove we didn't cheat.
`);

const tbs = loadJson("tbs.json", "Run step 03 first.");
const leafPem = loadArtifact(`${tbs.domain}.pem`, "Run step 05 first.");
const caRootPem = loadArtifact("ca-root.pem", "Run step 02 first.");

const { verifyCertzChain } = await sdk();

section("A) Certz SDK chain verification");
const result = verifyCertzChain({ leaf: leafPem, caRoot: caRootPem, domain: tbs.domain });
kv("leaf signed by CA", result.reasons.some((r) => r.includes("leaf signature")) ? "FAIL" : "ok");
kv("CA root self-signed", result.reasons.some((r) => r.includes("self-signature")) ? "FAIL" : "ok");
kv("within validity", result.reasons.some((r) => r.includes("validity")) ? "FAIL" : "ok");
kv("domain in SAN/CN", result.reasons.some((r) => r.includes("not present")) ? "FAIL" : "ok");
kv("OVERALL", result.ok ? "PASS" : "FAIL");
if (!result.ok) {
  result.reasons.forEach((r) => console.log("     - " + r));
  fail("SDK chain verification failed.");
}

section("B) Independent OpenSSL verification");
teach(`Running:  openssl verify -CAfile ca-root.pem <leaf>.pem`);
try {
  const out = execFileSync(
    "openssl",
    ["verify", "-CAfile", join(OUT, "ca-root.pem"), join(OUT, `${tbs.domain}.pem`)],
    { encoding: "utf8" },
  );
  console.log("  openssl says: " + out.trim());
  if (!/: OK\s*$/.test(out.trim())) fail("OpenSSL did not return OK");
} catch (e) {
  fail(`OpenSSL verification failed: ${(e.stdout || "") + (e.stderr || e.message)}`);
}

pass("Both the Certz SDK and OpenSSL agree: the certificate chains to the Certz CA.");
teach("Next:  npm run 07   — confirm the cert is anchored in the on-chain registry.");
