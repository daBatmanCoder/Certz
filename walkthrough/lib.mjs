// Shared helpers for the Certz walkthrough steps.
//
// Every step imports from here so the educational scripts stay short and focus
// on ONE idea each. Nothing magic happens here -- it just loads the deployment,
// opens an RPC connection, and persists a little state between steps.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resolver } from "node:dns/promises";
import { ethers } from "ethers";
import { wrapEthersSigner } from "@oasisprotocol/sapphire-ethers-v6";

export const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = process.env.CERTZ_NETWORK ?? "sapphire-testnet";
export const RPC = process.env.CERTZ_RPC ?? "https://testnet.sapphire.oasis.io";
const STATE_PATH = join(__dirname, ".state.json");

// --- pretty printing -------------------------------------------------------
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", magenta: "\x1b[35m",
};
export function heading(step, title) {
  const bar = "=".repeat(64);
  console.log(`\n${C.magenta}${bar}${C.reset}`);
  console.log(`${C.bold}${C.magenta}  STEP ${step}: ${title}${C.reset}`);
  console.log(`${C.magenta}${bar}${C.reset}\n`);
}
export function explain(text) {
  console.log(`${C.dim}${text}${C.reset}\n`);
}
export function kv(key, value) {
  console.log(`  ${C.cyan}${key.padEnd(18)}${C.reset} ${value}`);
}
export function ok(text) { console.log(`  ${C.green}\u2713${C.reset} ${text}`); }
export function bad(text) { console.log(`  ${C.red}\u2717${C.reset} ${text}`); }
export function warn(text) { console.log(`  ${C.yellow}!${C.reset} ${text}`); }
export function done(step) {
  console.log(`\n${C.green}${C.bold}  STEP ${step} complete.${C.reset}\n`);
}

// --- deployment / chain ----------------------------------------------------
export function loadDeployment() {
  const path = resolve(__dirname, "..", "brain", "contracts", "deployments", `${NETWORK}.json`);
  if (!existsSync(path)) {
    console.error(`No deployment at ${path}. Deploy the contracts first (see brain/contracts).`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function provider() {
  return new ethers.JsonRpcProvider(RPC);
}

export function requireWallet() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error(
      "\n  This step sends an on-chain transaction and needs a funded Sapphire\n" +
      "  testnet key. Run it like:\n\n" +
      "    PRIVATE_KEY=<your-testnet-key> npm run step3\n\n" +
      "  Get test tokens at https://faucet.testnet.oasis.io\n",
    );
    process.exit(1);
  }
  // wrapEthersSigner => the tx calldata sent to Sapphire is encrypted end-to-end
  // (you'll see the green lock on the explorer). Reads/signing inside the TEE are
  // confidential regardless; this protects the calldata in transit + mempool.
  return wrapEthersSigner(new ethers.Wallet(pk, provider()));
}

export const CA_ABI = [
  "function caPublicKey() view returns (bytes)",
  "function initialized() view returns (bool)",
  "function devMode() view returns (bool)",
  "function rootCertTbsSha256() view returns (bytes32)",
  "function requestCertificate(string domain, bytes32 tbsSha256, uint64 notAfter) returns (bytes32, bytes32)",
  "function devFulfill(bytes32 requestId)",
  "function getSignature(bytes32 requestId) view returns (bytes)",
  "function getRequest(bytes32 requestId) view returns (tuple(string domain, bytes32 tbsSha256, bytes32 challenge, address requester, uint64 notAfter, bool exists, bool fulfilled))",
  "event ChallengeRequested(bytes32 indexed requestId, string domain, bytes32 challenge, address indexed requester)",
];
export const REGISTRY_ABI = [
  "function isValid(bytes32 tbsSha256) view returns (bool)",
  "function getRecord(bytes32 tbsSha256) view returns (tuple(string domain, bytes32 tbsSha256, uint64 issuedAt, uint64 notAfter, bool revoked, bool exists))",
  "function digestsForDomain(string domain) view returns (bytes32[])",
];

export { ethers };

// --- state shared across steps ---------------------------------------------
export function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch { return {}; }
}
export function saveState(patch) {
  const state = { ...loadState(), ...patch };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return state;
}
export function needState(key) {
  const state = loadState();
  if (!(key in state)) {
    console.error(`\n  Missing "${key}" in walkthrough state. Run the earlier steps first (npm run all).\n`);
    process.exit(1);
  }
  return state[key];
}

export const DOMAIN = process.env.CERTZ_DOMAIN ?? "demo.certz.example";

// --- hex helpers (steps store bytes as hex in .state.json) -----------------
export const toHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (hex) => Uint8Array.from((hex.replace(/^0x/, "")).match(/../g).map((h) => parseInt(h, 16)));

// --- DNS-01 lookup (authoritative NS + public + system resolvers) ----------
// We query the domain's AUTHORITATIVE nameservers directly (cache-free, like
// Let's Encrypt) plus public recursive resolvers, and accept if ANY sees it.
// Override the recursive set with CERTZ_DNS_SERVERS="1.1.1.1,8.8.8.8".
const PUBLIC_DNS = (process.env.CERTZ_DNS_SERVERS ?? "1.1.1.1,8.8.8.8,9.9.9.9")
  .split(",").map((s) => s.trim()).filter(Boolean);

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

export async function resolveChallengeTxt(domain) {
  const name = `_certz-challenge.${domain}`;
  const authIps = await authoritativeIps(domain);
  const attempts = [
    txtVia(authIps.length ? authIps : null, name),
    txtVia(null, name),
    ...PUBLIC_DNS.map((s) => txtVia([s], name)),
  ];
  return [...new Set((await Promise.all(attempts)).flat())];
}

export function txtMatchesChallenge(records, challenge) {
  const want = challenge.replace(/^0x/, "");
  return records.some((v) => v === challenge || v.replace(/^0x/, "") === want);
}
