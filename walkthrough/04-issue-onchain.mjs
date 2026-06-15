// STEP 04 — Request issuance, prove domain ownership (DNS-01), sign in the TEE.
//
// Run:  PRIVATE_KEY=<funded-testnet-key> npm run 04
//       (sends REAL transactions to Sapphire testnet)
import { ethers } from "ethers";
import {
  title, teach, section, kv, pass, fail, short, RPC,
  loadDeployment, loadJson, saveJson, requireKey,
} from "./_lib.mjs";

title("04", "Issuance: ask the CA to sign, after proving you own the domain");

teach(`
This mirrors how Let's Encrypt works (the "ACME DNS-01" challenge):

  1. You ASK the CA for a certificate for your domain. The CA gives back a random
     challenge token.
  2. You PUBLISH that token in a DNS TXT record at _certz-challenge.<domain>.
     Only the real domain owner can do that.
  3. A verifier (in Certz, a ROFL TEE oracle) reads that TXT record. If it matches,
     it tells the on-chain CA "ownership proven — you may sign."
  4. The CA signs your TBS digest INSIDE the enclave and records the issuance.

DEMO NOTE: you don't actually own "demo.certz.example", so we can't really publish
its DNS record. To let you see the rest end-to-end, this step uses the contract's
owner-gated 'devFulfill' — the exact same signing path, with the DNS check
simulated. Everything else (the signature, the on-chain record, the cert) is REAL.
`);

const pk = requireKey();
const dep = loadDeployment();
const tbs = loadJson("tbs.json", "Run step 03 first (npm run 03).");

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(pk, provider);
const ca = new ethers.Contract(
  dep.ca,
  [
    "function requestCertificate(string domain, bytes32 tbsSha256, uint64 notAfter) returns (bytes32, bytes32)",
    "function devFulfill(bytes32 requestId)",
    "function getSignature(bytes32 requestId) view returns (bytes)",
    "event ChallengeRequested(bytes32 indexed requestId, string domain, bytes32 challenge, address indexed requester)",
  ],
  wallet,
);

kv("issuing as", wallet.address);
kv("domain", tbs.domain);
kv("tbs digest", tbs.tbsDigestHex);

section("1) requestCertificate(...)  — opens an issuance request on-chain");
const reqTx = await ca.requestCertificate(tbs.domain, tbs.tbsDigestHex, tbs.notAfterUnix);
kv("tx hash", reqTx.hash);
const receipt = await reqTx.wait();
kv("mined in block", receipt.blockNumber);

let requestId, challenge;
for (const log of receipt.logs) {
  try {
    const ev = ca.interface.parseLog(log);
    if (ev?.name === "ChallengeRequested") {
      requestId = ev.args.requestId;
      challenge = ev.args.challenge;
    }
  } catch {}
}
if (!requestId) fail("ChallengeRequested event not found in the receipt");

section("2) The DNS-01 challenge you would publish");
kv("requestId", short(requestId, 12));
kv("TXT record name", `_certz-challenge.${tbs.domain}`);
kv("TXT record value", challenge);
teach(`In production the ROFL oracle now reads that TXT record. Here we simulate it:`);

section("3) devFulfill(requestId)  — (demo) simulates the oracle's 'ownership OK'");
const fulfillTx = await ca.devFulfill(requestId);
kv("tx hash", fulfillTx.hash);
await fulfillTx.wait();
kv("status", "fulfilled — the CA signed the digest inside the TEE");

section("4) getSignature(requestId)  — the CA's signature, made in the enclave");
const signature = await ca.getSignature(requestId);
kv("DER signature", short(signature, 16));
kv("length", `${(signature.length - 2) / 2} bytes`);

saveJson("issuance.json", {
  domain: tbs.domain,
  requestId,
  challenge,
  signatureDerHex: signature,
  requestTx: reqTx.hash,
  fulfillTx: fulfillTx.hash,
});

pass("The on-chain confidential CA signed your certificate. Saved issuance.json.");
teach("Next:  npm run 05   — splice that signature into a real X.509 certificate.");
