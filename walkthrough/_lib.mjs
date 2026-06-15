// Shared helpers for the walkthrough steps. Kept tiny and dependency-light so
// each step file stays focused on TEACHING one idea, not plumbing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, "out");
export const RPC = process.env.CERTZ_RPC ?? "https://testnet.sapphire.oasis.io";
export const NETWORK = process.env.CERTZ_NETWORK ?? "sapphire-testnet";

const DEPLOYMENT = resolve(HERE, "..", "brain", "contracts", "deployments", `${NETWORK}.json`);

// ---- pretty printing --------------------------------------------------------

export function title(step, name) {
  const bar = "═".repeat(70);
  console.log(`\n${bar}\n  STEP ${step} — ${name}\n${bar}`);
}

export function teach(text) {
  // Wrap explanatory paragraphs nicely.
  const words = text.trim().split(/\s+/);
  let line = "";
  const lines = [];
  for (const w of words) {
    if ((line + " " + w).trim().length > 76) {
      lines.push(line.trim());
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) lines.push(line.trim());
  console.log("\n" + lines.map((l) => "  " + l).join("\n") + "\n");
}

export function kv(key, value) {
  console.log(`  ${key.padEnd(22)} ${value}`);
}

export function section(label) {
  console.log(`\n  ── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
}

export function pass(msg) {
  console.log(`\n  ✓ ${msg}\n`);
}
export function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

// ---- hex helpers ------------------------------------------------------------

export const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (hex) =>
  Uint8Array.from(hex.replace(/^0x/, "").match(/../g).map((h) => parseInt(h, 16)));
export const short = (hex, n = 10) => {
  const h = hex.replace(/^0x/, "");
  return h.length <= n * 2 ? "0x" + h : `0x${h.slice(0, n)}…${h.slice(-6)}`;
};

// ---- deployment + artifacts -------------------------------------------------

export function loadDeployment() {
  if (!existsSync(DEPLOYMENT)) {
    fail(`No deployment at ${DEPLOYMENT}. Deploy the contracts first (see brain/contracts).`);
  }
  return JSON.parse(readFileSync(DEPLOYMENT, "utf8"));
}

export function requireKey() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    fail(
      "This step sends a real transaction and needs a funded Sapphire testnet key.\n" +
        "  Run it as:  PRIVATE_KEY=<your-key> npm run 04\n" +
        "  Faucet: https://faucet.testnet.oasis.io (select Sapphire Testnet)",
    );
  }
  return pk;
}

export function saveArtifact(name, contents) {
  mkdirSync(OUT, { recursive: true });
  const p = join(OUT, name);
  writeFileSync(p, contents);
  return p;
}

export function loadArtifact(name, hint) {
  const p = join(OUT, name);
  if (!existsSync(p)) {
    fail(`Missing artifact "${name}". ${hint ?? "Run the earlier steps first."}`);
  }
  return readFileSync(p, "utf8");
}

export function saveJson(name, obj) {
  return saveArtifact(name, JSON.stringify(obj, null, 2));
}
export function loadJson(name, hint) {
  return JSON.parse(loadArtifact(name, hint));
}

// ---- SDK loader -------------------------------------------------------------
// We import the COMPILED SDK so the walkthrough exercises the exact same code
// the CLI, oracle, and extension use.

export async function sdk() {
  const distIndex = resolve(HERE, "..", "brain", "sdk", "dist", "index.js");
  if (!existsSync(distIndex)) {
    fail("SDK is not built. Run:  cd ../brain/sdk && npm install && npm run build");
  }
  return import(distIndex);
}
