// STEP 5 -- The TEE signs your TBS digest.
//
// Once ownership is confirmed, issuance is "fulfilled". In production the
// attested ROFL TEE oracle (which verified DNS in step 4) calls fulfill(); here
// we use the owner-only devFulfill() to stand in for that oracle. Either way,
// the same thing happens INSIDE the enclave: the CA's private key signs your
// TBS digest and the result is recorded in the public registry.
import { heading, explain, kv, ok, warn, done, requireWallet, loadDeployment, needState, saveState, ethers, CA_ABI, resolveChallengeTxt, txtMatchesChallenge } from "./lib.mjs";

heading(5, "Fulfill issuance -> the TEE signs the digest");
explain(
  "We call devFulfill(requestId) (owner-only, dev stand-in for the ROFL oracle).\n" +
  "The contract runs Sapphire.sign() with the CA key inside the TEE and stores\n" +
  "the resulting DER signature. We then read that signature back.",
);

const dep = loadDeployment();
const wallet = requireWallet();
const ca = new ethers.Contract(dep.ca, CA_ABI, wallet);
const requestId = needState("requestId");
const domain = needState("domain");
const challenge = needState("challenge");

// Honesty gate: for a REAL domain (one you actually own) we refuse to fulfill
// unless a matching DNS-01 TXT record is live -- exactly what the website does.
// Placeholder/demo domains (*.example etc.) skip this because no real DNS exists.
const isReal = !/\.(example|invalid|localhost|test)$/.test(domain) && !domain.includes("certz.example");
if (isReal) {
  const flat = await resolveChallengeTxt(domain);
  const dnsOk = txtMatchesChallenge(flat, challenge);
  if (!dnsOk) {
    warn(`DNS-01 not satisfied for ${domain}.`);
    warn(`Publish TXT _certz-challenge.${domain} = ${challenge}, let it propagate, then re-run step 5.`);
    process.exit(1);
  }
  ok(`DNS-01 verified for ${domain} -- proceeding to fulfill.`);
}

const devMode = await ca.devMode();
kv("devMode", devMode);
if (!devMode) {
  console.error("  devMode is off on this deployment; cannot devFulfill. Enable it or use the ROFL oracle.");
  process.exit(1);
}

console.log("\n  Sending devFulfill(...) transaction...");
const tx = await ca.devFulfill(requestId);
const receipt = await tx.wait();
kv("Tx hash", receipt.hash);
ok("Issuance fulfilled. The CA signed inside the TEE.");

const sig = await ca.getSignature(requestId);
kv("DER signature", sig);
ok("Read back the DER ECDSA signature produced by the TEE-held key.");

explain(
  "\nNotice we only ever read a SIGNATURE out -- never the key. In step 6 we splice\n" +
  "this signature into a real X.509 certificate.",
);

saveState({ signatureDer: sig });
done(5);
