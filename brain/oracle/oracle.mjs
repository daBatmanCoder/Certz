#!/usr/bin/env node
// Certz DNS-01 oracle.
//
// Responsibility: prove domain ownership, then authorize the confidential CA to
// sign. It watches ConfidentialCA for ChallengeRequested events, resolves the
// TXT record `_certz-challenge.<domain>`, and if it matches the on-chain
// challenge nonce, calls the contract to issue.
//
// Two modes:
//   --mode tee   call fulfill(requestId). The contract enforces
//                roflEnsureAuthorizedOrigin(roflAppId), so ONLY an attested ROFL
//                TEE instance is accepted. This is the production path.
//   --mode dev   call devFulfill(requestId) as the contract owner. For LOCAL
//                development before a ROFL app is registered. Still performs the
//                real DNS check -- it just isn't trustless.
//
// Flags: --watch (poll continuously), --once (single pass), --from <block>.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promises as dns } from "node:dns";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC = process.env.CERTZ_RPC ?? "https://testnet.sapphire.oasis.io";
const NETWORK = process.env.CERTZ_NETWORK ?? "sapphire-testnet";
const POLL_MS = Number(process.env.CERTZ_POLL_MS ?? 15000);

const args = process.argv.slice(2);
const MODE = (args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "dev");
const WATCH = args.includes("--watch");
const FROM_BLOCK = args.includes("--from")
  ? Number(args[args.indexOf("--from") + 1])
  : undefined;

const CA_ABI = [
  "function getRequest(bytes32) view returns (tuple(string domain, bytes32 tbsSha256, bytes32 challenge, address requester, uint64 notAfter, bool exists, bool fulfilled))",
  "function fulfill(bytes32 requestId)",
  "function devFulfill(bytes32 requestId)",
  "event ChallengeRequested(bytes32 indexed requestId, string domain, bytes32 challenge, address indexed requester)",
];

const CHALLENGE_LABEL = "_certz-challenge";

function loadDeployment() {
  const path = resolve(__dirname, "..", "contracts", "deployments", `${NETWORK}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Resolve _certz-challenge.<domain> TXT and test for the expected nonce. */
async function dnsChallengeSatisfied(domain, challengeHex) {
  const name = `${CHALLENGE_LABEL}.${domain}`;
  let records;
  try {
    records = await dns.resolveTxt(name);
  } catch (e) {
    return { ok: false, detail: `TXT lookup failed for ${name}: ${e.code ?? e.message}` };
  }
  const flat = records.map((chunks) => chunks.join("")).map((s) => s.trim().toLowerCase());
  const want = challengeHex.toLowerCase();
  const ok = flat.includes(want) || flat.includes(want.replace(/^0x/, ""));
  return { ok, detail: ok ? `matched ${name}` : `no TXT at ${name} equals ${want}` };
}

async function processRequest(ca, requestId, domain, challenge) {
  const req = await ca.getRequest(requestId);
  if (!req.exists) return;
  if (req.fulfilled) {
    console.log(`  [skip] ${requestId} already fulfilled`);
    return;
  }

  const check = await dnsChallengeSatisfied(domain, challenge);
  console.log(`  [dns]  ${domain}: ${check.detail}`);
  if (!check.ok) return;

  console.log(`  [issue:${MODE}] authorizing CA to sign ${domain}...`);
  const tx = MODE === "tee" ? await ca.fulfill(requestId) : await ca.devFulfill(requestId);
  await tx.wait();
  console.log(`  [done] issued for ${domain} (tx ${tx.hash})`);
}

// Sapphire testnet caps eth_getLogs at 100 rounds per query, so we page.
const MAX_LOG_RANGE = 100;

async function queryChallengesChunked(ca, start, latest) {
  const filter = ca.filters.ChallengeRequested();
  const all = [];
  for (let from = start; from <= latest; from += MAX_LOG_RANGE) {
    const to = Math.min(from + MAX_LOG_RANGE - 1, latest);
    const chunk = await ca.queryFilter(filter, from, to);
    all.push(...chunk);
  }
  return all;
}

async function pass(ca, provider, fromBlock) {
  const latest = await provider.getBlockNumber();
  const start = fromBlock ?? Math.max(0, latest - MAX_LOG_RANGE);
  const events = await queryChallengesChunked(ca, start, latest);
  if (events.length === 0) console.log(`  (no requests in blocks ${start}..${latest})`);
  for (const ev of events) {
    const { requestId, domain, challenge } = ev.args;
    console.log(`- request ${requestId} for ${domain}`);
    try {
      await processRequest(ca, requestId, domain, challenge);
    } catch (e) {
      console.error(`  [error] ${e.shortMessage ?? e.message}`);
    }
  }
  return latest;
}

async function main() {
  const dep = loadDeployment();
  const provider = new ethers.JsonRpcProvider(RPC);

  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("Set PRIVATE_KEY (TEE-derived key in prod, owner key for --mode dev).");
    process.exit(1);
  }
  const signer = new ethers.Wallet(pk, provider);
  const ca = new ethers.Contract(dep.ca, CA_ABI, signer);

  console.log(`Certz oracle  mode=${MODE}  network=${NETWORK}  ca=${dep.ca}`);
  if (MODE === "dev") {
    console.log("WARNING: dev mode uses the owner key and is NOT trustless. Use --mode tee in production (ROFL).");
  }

  let from = FROM_BLOCK;
  do {
    from = (await pass(ca, provider, from)) + 1;
    if (WATCH) await new Promise((r) => setTimeout(r, POLL_MS));
  } while (WATCH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
