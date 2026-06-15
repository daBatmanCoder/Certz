// STEP 02 — The confidential CA that lives on-chain.
//
// Run:  npm run 02     (reads Sapphire testnet; no key needed)
import { ethers } from "ethers";
import {
  title, teach, section, kv, pass, fail, short, RPC, loadDeployment, saveArtifact, sdk,
} from "./_lib.mjs";

title("02", "The Certificate Authority (its key is inside a TEE)");

teach(`
With Let's Encrypt, a company runs servers that hold the CA private key. You have
to trust that they protect it and don't misuse it.

Certz replaces that with a smart contract on Oasis Sapphire — a confidential,
TEE-backed blockchain. When the contract was deployed it generated its OWN P-256
keypair INSIDE the secure enclave. The private half is sealed in encrypted
contract state; no operator, and not even the chain validators, can read it. The
only way to use it is to ask the contract to sign — and only after a domain-
ownership check passes.

So: we can read the CA's PUBLIC key and its self-signed root certificate, but the
PRIVATE key is unobtainable by design. Let's read what we're allowed to read.
`);

const dep = loadDeployment();
const provider = new ethers.JsonRpcProvider(RPC);

section(`Reading the deployed contracts (chainId ${dep.chainId})`);
kv("CA contract", dep.ca);
kv("Registry contract", dep.registry);

const ca = new ethers.Contract(dep.ca, ["function caPublicKey() view returns (bytes)"], provider);
let onChainPub;
try {
  onChainPub = await ca.caPublicKey();
} catch (e) {
  fail(`Could not read caPublicKey() from the chain: ${e.shortMessage ?? e.message}`);
}

section("The CA's PUBLIC key, read live from the chain");
kv("caPublicKey()", onChainPub);
kv("matches deployment", onChainPub.toLowerCase() === dep.caPublicKey.toLowerCase() ? "yes" : "NO (!)");

teach(`
That 33-byte value is the compressed public key. Every Certz certificate is
signed by the matching PRIVATE key — the one we can never see. Below is the CA's
self-signed ROOT certificate: the anchor of trust that every leaf certificate
must chain up to.
`);

const { parseCertificate } = await sdk();
const root = parseCertificate(dep.caRootPem);
section("The CA root certificate");
kv("subject (CN)", root.subjectCommonName);
kv("issuer (CN)", root.issuerCommonName + "  (self-signed: issuer == subject)");
kv("is a CA?", root.isCa ? "yes (BasicConstraints cA=true)" : "no");
kv("valid until", root.notAfter.toISOString());
kv("SHA-256 fingerprint", short(root.fingerprintHex, 12));

saveArtifact("ca-root.pem", dep.caRootPem);
pass("You read a CA whose signing key is physically unreachable. Saved ca-root.pem.");
teach("Next:  npm run 03   — build the certificate body and see exactly what gets signed.");
