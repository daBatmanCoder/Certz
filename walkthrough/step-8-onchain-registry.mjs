// STEP 8 -- Check the public on-chain registry.
//
// Every issuance is anchored in a public registry contract (like Certificate
// Transparency logs). Anyone can ask: "is this certificate recorded, and is it
// still valid (not revoked, not expired)?" -- entirely read-only, no key needed.
import { createHash } from "node:crypto";
import { heading, explain, kv, ok, bad, done, needState, loadDeployment, provider, ethers, REGISTRY_ABI, fromHex } from "./lib.mjs";

heading(8, "Check the public on-chain registry");
explain(
  "The registry is keyed by sha256(TBSCertificate) -- the exact bytes the CA\n" +
  "signed. We recompute that digest from our cert and ask the contract about it.",
);

const dep = loadDeployment();
const registry = new ethers.Contract(dep.registry, REGISTRY_ABI, provider());

// Recompute the anchor digest from the stored TBS (same value step 3 committed).
const tbsDer = fromHex(needState("tbsDer"));
const tbsSha256 = "0x" + createHash("sha256").update(Buffer.from(tbsDer)).digest("hex");
const domain = needState("domain");

kv("Registry", dep.registry);
kv("TBS sha256", tbsSha256);

const valid = await registry.isValid(tbsSha256);
if (valid) ok("isValid() = true (recorded, not revoked, unexpired).");
else bad("isValid() = false.");

const record = await registry.getRecord(tbsSha256);
if (record.exists) {
  kv("Recorded domain", record.domain);
  kv("issuedAt", new Date(Number(record.issuedAt) * 1000).toISOString());
  kv("notAfter", new Date(Number(record.notAfter) * 1000).toISOString());
  kv("revoked", record.revoked);
}

const digests = await registry.digestsForDomain(domain);
kv(`Certs for ${domain}`, `${digests.length} on record`);

explain(
  "\nThis is the transparency layer: issuance is auditable and revocable on-chain,\n" +
  "independent of whoever is serving the website.",
);
done(8);
