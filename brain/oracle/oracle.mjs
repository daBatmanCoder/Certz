#!/usr/bin/env node
// Certz DNS-01 oracle.
//
// Responsibility: prove domain ownership, then authorize the confidential CA to
// sign. It watches ConfidentialCA for ChallengeRequested events, resolves the
// TXT record `_certz-challenge.<domain>`, and if it matches the on-chain
// challenge nonce, calls the contract to issue.
//
// Two modes:
//   --mode tee   submit fulfill(requestId) through the ROFL runtime's
//                authenticated channel (the /run/rofl-appd.sock socket). The tx
//                is signed by the app's enclave-endorsed ephemeral key, so the
//                contract's `Subcall.roflEnsureAuthorizedOrigin(roflAppId)` check
//                passes -- and ONLY an attested instance of THIS app can do it.
//                This is the trustless production path. A plain wallet CANNOT
//                satisfy roflEnsureAuthorizedOrigin, which is the whole point.
//   --mode dev   call devFulfill(requestId) as the contract owner. For LOCAL
//                development before a ROFL app is registered. Still performs the
//                real DNS check -- it just isn't trustless.
//
// Flags: --watch (poll continuously), --once (single pass), --from <block>.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resolver } from "node:dns/promises";
import { ethers } from "ethers";
import { RoflClient } from "@oasisprotocol/rofl-client";
import { decode as cborDecode } from "cborg";

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
// fulfill() signs (Sapphire precompile) + writes the registry + emits an event.
// No gas padding in the contract, so a flat, generous limit is plenty.
const FULFILL_GAS_LIMIT = Number(process.env.CERTZ_FULFILL_GAS ?? 1_000_000);
// Path to the rofl-appd UNIX socket (mounted into the container in compose.yaml).
const ROFL_SOCKET = process.env.ROFL_APPD_SOCKET ?? "/run/rofl-appd.sock";

function loadDeployment() {
  const path = resolve(__dirname, "..", "contracts", "deployments", `${NETWORK}.json`);
  return JSON.parse(readFileSync(path, "utf8"));
}

// Resolver strategy: query the domain's AUTHORITATIVE nameservers directly
// (cache-free, like Let's Encrypt) plus public recursive resolvers + the system
// one. Accept if ANY sees the record. Override recursive set via
// CERTZ_DNS_SERVERS="1.1.1.1,8.8.8.8".
const PUBLIC_DNS = (process.env.CERTZ_DNS_SERVERS ?? "1.1.1.1,8.8.8.8,9.9.9.9")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function txtVia(servers, name) {
  try {
    const resolver = new Resolver({ timeout: 4000, tries: 1 });
    if (servers && servers.length) resolver.setServers(servers);
    const records = await resolver.resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

async function authoritativeIps(domain) {
  const sys = new Resolver({ timeout: 4000, tries: 1 });
  const labels = domain.split(".").filter(Boolean);
  for (let i = 0; i <= Math.max(0, labels.length - 2); i++) {
    const zone = labels.slice(i).join(".");
    try {
      const hosts = await sys.resolveNs(zone);
      const ips = [];
      for (const h of hosts) {
        try { ips.push(...(await sys.resolve4(h))); } catch {}
      }
      if (ips.length) return [...new Set(ips)];
    } catch { /* try parent zone */ }
  }
  return [];
}

/** Resolve _certz-challenge.<domain> TXT (authoritative + public + system) and
 *  test for the expected nonce. Accept if ANY resolver sees a matching record. */
async function dnsChallengeSatisfied(domain, challengeHex) {
  const name = `${CHALLENGE_LABEL}.${domain}`;
  const authIps = await authoritativeIps(domain);
  const attempts = [
    txtVia(authIps.length ? authIps : null, name),
    txtVia(null, name),
    ...PUBLIC_DNS.map((s) => txtVia([s], name)),
  ];
  const flat = (await Promise.all(attempts)).flat().map((s) => s.trim().toLowerCase());
  const want = challengeHex.toLowerCase();
  const ok = flat.includes(want) || flat.includes(want.replace(/^0x/, ""));
  return { ok, detail: ok ? `matched ${name}` : `no TXT at ${name} equals ${want}` };
}

async function processRequest(ca, fulfill, requestId, domain, challenge) {
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
  const detail = await fulfill(requestId);
  console.log(`  [done] issued for ${domain} (${detail})`);
}

// --- the two ways to authorize signing -------------------------------------

// DEV: owner-signed devFulfill via a plain wallet. NOT trustless.
function devFulfiller(ca) {
  return async (requestId) => {
    const tx = await ca.devFulfill(requestId);
    await tx.wait();
    return `tx ${tx.hash}`;
  };
}

// TEE: submit fulfill() through rofl-appd. The runtime signs with the app's
// enclave-endorsed key so roflEnsureAuthorizedOrigin(roflAppId) passes. There is
// NO private key here -- that is exactly what makes it trustless.
function teeFulfiller(caAddress, iface) {
  const rofl = new RoflClient(ROFL_SOCKET);
  return async (requestId) => {
    const data = iface.encodeFunctionData("fulfill", [requestId]);
    const callResultBytes = await rofl.signAndSubmit({
      kind: "eth",
      gas_limit: FULFILL_GAS_LIMIT,
      to: caAddress,
      value: "0",
      data,
    });
    // CallResult is CBOR: { ok: <bytes> } | { fail: { module, code, message } }.
    const result = cborDecode(new Uint8Array(callResultBytes));
    if (result && typeof result === "object" && "fail" in result) {
      const f = result.fail ?? {};
      throw new Error(`fulfill reverted: module=${f.module} code=${f.code} ${f.message ?? ""}`);
    }
    return "submitted via ROFL (attested origin)";
  };
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

async function pass(ca, fulfill, provider, fromBlock) {
  const latest = await provider.getBlockNumber();
  const start = fromBlock ?? Math.max(0, latest - MAX_LOG_RANGE);
  const events = await queryChallengesChunked(ca, start, latest);
  if (events.length === 0) console.log(`  (no requests in blocks ${start}..${latest})`);
  for (const ev of events) {
    const { requestId, domain, challenge } = ev.args;
    console.log(`- request ${requestId} for ${domain}`);
    try {
      await processRequest(ca, fulfill, requestId, domain, challenge);
    } catch (e) {
      console.error(`  [error] ${e.shortMessage ?? e.message}`);
    }
  }
  return latest;
}

async function main() {
  const dep = loadDeployment();
  const provider = new ethers.JsonRpcProvider(RPC);
  const iface = new ethers.Interface(CA_ABI);

  // dev: needs the owner key to call devFulfill. tee: NO key -- the ROFL runtime
  // signs with the app's enclave-endorsed key, so we only read with `provider`.
  let ca;
  let fulfill;
  if (MODE === "tee") {
    ca = new ethers.Contract(dep.ca, CA_ABI, provider);
    fulfill = teeFulfiller(dep.ca, iface);
  } else {
    const pk = process.env.PRIVATE_KEY;
    if (!pk) {
      console.error("Set PRIVATE_KEY (the ConfidentialCA owner key) for --mode dev.");
      process.exit(1);
    }
    ca = new ethers.Contract(dep.ca, CA_ABI, new ethers.Wallet(pk, provider));
    fulfill = devFulfiller(ca);
    console.log("WARNING: dev mode uses the owner key and is NOT trustless. Use --mode tee in production (ROFL).");
  }

  console.log(`Certz oracle  mode=${MODE}  network=${NETWORK}  ca=${dep.ca}`);

  let from = FROM_BLOCK;
  do {
    from = (await pass(ca, fulfill, provider, from)) + 1;
    if (WATCH) await new Promise((r) => setTimeout(r, POLL_MS));
  } while (WATCH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
