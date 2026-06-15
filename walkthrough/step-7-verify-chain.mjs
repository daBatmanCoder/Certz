// STEP 7 -- Verify the certificate chain.
//
// Anyone holding the certificate can check it was really signed by the Certz CA,
// is in date, and covers the right domain -- WITHOUT trusting us. We verify two
// independent ways: with the Certz SDK, and with OpenSSL (the same tool the
// whole internet uses), so you know the SDK isn't grading its own homework.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyCertzChain } from "../brain/sdk/dist/index.js";
import { heading, explain, kv, ok, bad, done, needState, loadDeployment, __dirname } from "./lib.mjs";

heading(7, "Verify the chain (SDK + OpenSSL)");

const dep = loadDeployment();
const domain = needState("domain");
const certPem = needState("certPem");
const caRootPem = dep.caRootPem;

explain("(a) SDK verification: leaf signed by CA root, valid window, SAN matches.");
const result = verifyCertzChain({ leaf: certPem, caRoot: caRootPem, domain });
if (result.ok) {
  ok("SDK: chain VALID.");
  kv("Issuer", result.leaf.issuerCommonName);
  kv("Subject", result.leaf.subjectCommonName);
  kv("SAN", result.leaf.dnsNames.join(", "));
} else {
  bad("SDK: chain INVALID:");
  result.reasons.forEach((r) => console.log(`     - ${r}`));
}

explain("\n(b) Independent OpenSSL verification of the same files.");
const outDir = join(__dirname, "out");
mkdirSync(outDir, { recursive: true });
const caPath = join(outDir, "ca-root.pem");
const leafPath = join(outDir, `${domain}.pem`);
writeFileSync(caPath, caRootPem);
writeFileSync(leafPath, certPem);

const openssl = spawnSync("openssl", ["verify", "-CAfile", caPath, leafPath], { encoding: "utf8" });
if (openssl.error) {
  console.log("     (openssl not found -- skipping independent check)");
} else {
  process.stdout.write("     " + (openssl.stdout || openssl.stderr).trim() + "\n");
  if (openssl.status === 0) ok("OpenSSL independently confirms the chain.");
  else bad("OpenSSL rejected the chain (see message above).");
}

explain(
  "\nNote: 'verified' here means cryptographically signed by the Certz CA. It does\n" +
  "NOT mean your browser trusts it -- Certz isn't in any browser root store, and\n" +
  "that's a policy/audit process, not a code task. This is an out-of-band check.",
);
done(7);
