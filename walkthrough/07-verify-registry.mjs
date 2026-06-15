// STEP 07 — Verify the on-chain transparency registry anchor.
//
// Run:  npm run 07     (reads Sapphire testnet; no key needed)
import { ethers } from "ethers";
import {
  title, teach, section, kv, pass, fail, RPC, loadDeployment, loadJson, loadArtifact, sdk,
} from "./_lib.mjs";

title("07", "On-chain anchor: is this exact cert recorded (and not revoked)?");

teach(`
The chain check in step 06 proves the cert is well-formed and CA-signed. But how
do you know the CA actually MEANT to issue it, and hasn't revoked it since?

Certz records every issuance in a public registry contract — like Certificate
Transparency, but enforced on-chain. The registry is keyed by sha256(TBS), the
exact value the CA signed. We recompute that digest from the cert and ask the
registry contract: do you have it, and is it still valid?
`);

const dep = loadDeployment();
const tbs = loadJson("tbs.json", "Run step 03 first.");
const leafPem = loadArtifact(`${tbs.domain}.pem`, "Run step 05 first.");

const { parseCertificate } = await sdk();
const parsed = parseCertificate(leafPem);

// The registry is keyed by sha256(TBSCertificate).
const crypto = await import("node:crypto");
const tbsSha256 = "0x" + crypto.createHash("sha256").update(Buffer.from(parsed.tbsDer)).digest("hex");

section("Recomputing the on-chain key from the certificate");
kv("sha256(TBS)", tbsSha256);
kv("matches step 03", tbsSha256.toLowerCase() === tbs.tbsDigestHex.toLowerCase() ? "yes" : "NO (!)");

const provider = new ethers.JsonRpcProvider(RPC);
const registry = new ethers.Contract(
  dep.registry,
  [
    "function isValid(bytes32 tbsSha256) view returns (bool)",
    "function getRecord(bytes32 tbsSha256) view returns (tuple(string domain, bytes32 tbsSha256, uint64 issuedAt, uint64 notAfter, bool revoked, bool exists))",
  ],
  provider,
);

section("Asking the registry contract");
const valid = await registry.isValid(tbsSha256);
const rec = await registry.getRecord(tbsSha256);

kv("exists on-chain", rec.exists ? "yes" : "no");
kv("recorded domain", rec.domain || "(none)");
if (rec.exists) {
  kv("issued at", new Date(Number(rec.issuedAt) * 1000).toISOString());
  kv("not after", new Date(Number(rec.notAfter) * 1000).toISOString());
  kv("revoked", rec.revoked ? "YES" : "no");
}
kv("isValid()", valid ? "VALID" : "NOT VALID");

if (!valid) fail("Registry says this certificate is not valid (missing, expired, or revoked).");
pass("The certificate is anchored on-chain and currently valid.");
teach("Next:  npm run 08   — prove the site actually HOLDS the private key (the live check).");
