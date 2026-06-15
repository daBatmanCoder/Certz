#!/usr/bin/env node
// Certz CLI. Issue and verify certificates against the on-chain confidential CA.
//
//   certz info                         show deployment + CA root
//   certz ca-root                      print the CA root certificate (PEM)
//   certz verify <domain> <cert.pem>   verify a cert: chain + on-chain registry
//   certz issue  <domain>              run the full issuance flow (needs PRIVATE_KEY)
//
// Reads deployment from brain/contracts/deployments/<network>.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
// State-changing txs are sent through a Sapphire-wrapped signer so the calldata
// is encrypted end-to-end (green lock on the explorer). Reads here are public
// (registry state, the DER signature), so a plain provider is fine for those.
import { wrapEthersSigner } from "@oasisprotocol/sapphire-ethers-v6";
import {
  buildTbsCertificate,
  finalizeCertificate,
  generateSubjectKeyPair,
  verifyCertzChain,
  toPem,
} from "../sdk/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = process.env.CERTZ_NETWORK ?? "sapphire-testnet";
const RPC = process.env.CERTZ_RPC ?? "https://testnet.sapphire.oasis.io";

const CA_ABI = [
  "function caPublicKey() view returns (bytes)",
  "function requestCertificate(string domain, bytes32 tbsSha256, uint64 notAfter) returns (bytes32, bytes32)",
  "function devFulfill(bytes32 requestId)",
  "function getSignature(bytes32 requestId) view returns (bytes)",
  "event ChallengeRequested(bytes32 indexed requestId, string domain, bytes32 challenge, address indexed requester)",
];
const REGISTRY_ABI = [
  "function isValid(bytes32 tbsSha256) view returns (bool)",
  "function getRecord(bytes32 tbsSha256) view returns (tuple(string domain, bytes32 tbsSha256, uint64 issuedAt, uint64 notAfter, bool revoked, bool exists))",
];

function loadDeployment() {
  const path = resolve(__dirname, "..", "contracts", "deployments", `${NETWORK}.json`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error(`No deployment found at ${path}. Deploy the contracts first.`);
    process.exit(1);
  }
}

function readProvider() {
  return new ethers.JsonRpcProvider(RPC);
}

function fail(msg) {
  console.error("error:", msg);
  process.exit(1);
}

async function cmdInfo() {
  const dep = loadDeployment();
  console.log("network:       ", dep.network, `(chainId ${dep.chainId})`);
  console.log("registry:      ", dep.registry);
  console.log("confidentialCA:", dep.ca);
  console.log("caPublicKey:   ", dep.caPublicKey);
  console.log("deployedAt:    ", dep.deployedAt);
}

async function cmdCaRoot() {
  console.log(loadDeployment().caRootPem.trimEnd());
}

async function cmdVerify(domain, certPath) {
  if (!domain || !certPath) fail("usage: certz verify <domain> <cert.pem>");
  const dep = loadDeployment();
  const leafPem = readFileSync(certPath, "utf8");

  // 1. Off-chain: chain + validity + SAN.
  const chain = verifyCertzChain({ leaf: leafPem, caRoot: dep.caRootPem, domain });

  // 2. On-chain: is the TBS digest registered and not revoked?
  // The registry is keyed by sha256(TBSCertificate) -- the exact value the CA signed.
  const { parseCertificate } = await import("../sdk/dist/index.js");
  const crypto = await import("node:crypto");
  const parsed = parseCertificate(leafPem);
  const tbsSha256 =
    "0x" + crypto.createHash("sha256").update(Buffer.from(parsed.tbsDer)).digest("hex");

  const registry = new ethers.Contract(dep.registry, REGISTRY_ABI, readProvider());
  let onChainValid = false;
  let record = null;
  try {
    onChainValid = await registry.isValid(tbsSha256);
    record = await registry.getRecord(tbsSha256);
  } catch (e) {
    console.warn("  (could not read registry:", e.shortMessage ?? e.message, ")");
  }

  console.log(`Domain:            ${domain}`);
  console.log(`Issuer:            ${parsed.issuerCommonName}`);
  console.log(`Subject:           ${parsed.subjectCommonName}`);
  console.log(`SAN:               ${parsed.dnsNames.join(", ")}`);
  console.log(`Valid window:      ${parsed.notBefore.toISOString()} -> ${parsed.notAfter.toISOString()}`);
  console.log("");
  console.log(`Off-chain chain:   ${chain.ok ? "PASS" : "FAIL"}`);
  if (!chain.ok) chain.reasons.forEach((r) => console.log(`   - ${r}`));
  console.log(`On-chain registry: ${onChainValid ? "VALID (recorded, not revoked, unexpired)" : "NOT VALID"}`);
  if (record && record.exists) console.log(`   recorded domain: ${record.domain}`);

  process.exit(chain.ok && onChainValid ? 0 : 1);
}

async function cmdIssue(domain) {
  if (!domain) fail("usage: certz issue <domain>");
  const pk = process.env.PRIVATE_KEY;
  if (!pk) fail("set PRIVATE_KEY env var (a funded Sapphire testnet key) to issue");

  const dep = loadDeployment();
  const signer = wrapEthersSigner(new ethers.Wallet(pk, readProvider()));
  const ca = new ethers.Contract(dep.ca, CA_ABI, signer);

  const subject = generateSubjectKeyPair();
  const leaf = buildTbsCertificate({
    subjectCommonName: domain,
    issuerCommonName: "Certz Confidential CA",
    subjectPublicKeyCompressed: subject.publicKeyCompressed,
    validityDays: 90,
    isCa: false,
    dnsNames: [domain],
  });
  const tbsDigestHex = "0x" + Buffer.from(leaf.digest).toString("hex");
  const notAfter = Math.floor(leaf.notAfter.getTime() / 1000);

  console.log(`Requesting certificate for ${domain}...`);
  const tx = await ca.requestCertificate(domain, tbsDigestHex, notAfter);
  const receipt = await tx.wait();
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
  if (!requestId) fail("ChallengeRequested event not found");

  console.log(`\nDNS-01 challenge:`);
  console.log(`  set TXT  _certz-challenge.${domain} = ${challenge}`);
  console.log(`\n(dev mode) simulating ROFL oracle DNS verification + fulfill...`);
  await (await ca.devFulfill(requestId)).wait();

  const sig = await ca.getSignature(requestId);
  const cert = finalizeCertificate(leaf.tbs, ethers.getBytes(sig));

  const outDir = join(process.cwd(), "certz-out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${domain}.pem`), cert.pem);
  writeFileSync(
    join(outDir, `${domain}.key.pem`),
    toPem(Buffer.from(subject.privateKey), "EC PRIVATE KEY (RAW DEMO)"),
  );

  const verify = verifyCertzChain({ leaf: cert.der, caRoot: dep.caRootPem, domain });
  console.log(`\nIssued. chain verify: ${verify.ok ? "PASS" : "FAIL"}`);
  console.log(`Saved: certz-out/${domain}.pem (and .key.pem)`);
  console.log(`\n${cert.pem.trimEnd()}`);
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  info: () => cmdInfo(),
  "ca-root": () => cmdCaRoot(),
  verify: () => cmdVerify(args[0], args[1]),
  issue: () => cmdIssue(args[0]),
};
(commands[cmd] ?? (() => {
  console.log("Certz CLI");
  console.log("  certz info");
  console.log("  certz ca-root");
  console.log("  certz verify <domain> <cert.pem>");
  console.log("  certz issue  <domain>            (needs PRIVATE_KEY)");
  process.exit(cmd ? 1 : 0);
}))();
