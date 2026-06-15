// STEP 3 -- Ask the CA to issue, and receive a DNS-01 ownership challenge.
//
// This is the Let's Encrypt model. You don't just get a certificate for asking;
// first you must PROVE you control the domain. You send the CA your TBS digest
// (from step 2) and it replies with a random challenge nonce that you must
// publish in DNS. This step sends a real transaction to Sapphire testnet.
import { heading, explain, kv, ok, done, requireWallet, loadDeployment, needState, saveState, ethers, CA_ABI } from "./lib.mjs";

heading(3, "Request issuance -> get a DNS-01 challenge");
explain(
  "We submit the domain + the TBS digest from step 2 on-chain. The contract\n" +
  "generates a random challenge (using the TEE's secure RNG) and remembers our\n" +
  "request. NOTHING is signed yet -- ownership is still unproven.",
);

const dep = loadDeployment();
const wallet = requireWallet();
const ca = new ethers.Contract(dep.ca, CA_ABI, wallet);

const domain = needState("domain");
const tbsDigestHex = "0x" + needState("tbsDigestHex");
const notAfter = needState("notAfter");

kv("Domain", domain);
kv("TBS digest", tbsDigestHex);
kv("From address", wallet.address);

console.log("\n  Sending requestCertificate(...) transaction...");
const tx = await ca.requestCertificate(domain, tbsDigestHex, notAfter);
const receipt = await tx.wait();
kv("Tx hash", receipt.hash);

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
if (!requestId) {
  console.error("  Could not find the ChallengeRequested event."); process.exit(1);
}

ok("The CA accepted the request and issued a challenge.");
kv("requestId", requestId);
kv("challenge", challenge);

explain(
  `\nNext (step 4) you would publish this challenge as a DNS TXT record at\n` +
  `  _certz-challenge.${domain}\n` +
  "so the TEE oracle can confirm you really control the domain.",
);

saveState({ requestId, challenge });
done(3);
