import { CERTZ } from "./config.js";

const $ = (id) => document.getElementById(id);

function pad32(hexNoPrefix) {
  return hexNoPrefix.padStart(64, "0");
}

function strToHex(s) {
  return [...new TextEncoder().encode(s)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** ABI-encode digestsForDomain(string domain). */
function encodeCall(domain) {
  const bytes = new TextEncoder().encode(domain);
  const len = bytes.length;
  const dataHex = strToHex(domain);
  const padLen = ((32 - (len % 32)) % 32) * 2;
  const head = CERTZ.digestsForDomainSelector + pad32("20"); // offset to dynamic arg
  return head + pad32(len.toString(16)) + dataHex + "0".repeat(padLen);
}

/** Decode the length of the returned bytes32[]. */
function decodeArrayLength(resultHex) {
  const h = resultHex.replace(/^0x/, "");
  if (h.length < 128) return 0;
  // [0..64) = offset (0x20), [64..128) = length
  return parseInt(h.slice(64, 128), 16);
}

async function ethCall(data) {
  const res = await fetch(CERTZ.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: CERTZ.registry, data }, "latest"],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

function setStatus(kind, title, detail) {
  $("status").className = `status ${kind}`;
  $("status-title").textContent = title;
  $("status-detail").textContent = detail;
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let domain = "";
  try {
    domain = new URL(tab.url).hostname;
  } catch {
    setStatus("warn", "No site", "Open a website tab and reopen this popup.");
    return;
  }
  $("domain").textContent = domain;
  setStatus("pending", "Checking Certz registry…", `Querying on-chain records for ${domain}`);

  try {
    const result = await ethCall(encodeCall(domain));
    const count = decodeArrayLength(result);
    if (count > 0) {
      setStatus(
        "ok",
        `Certz records found (${count})`,
        `The Certz registry has ${count} certificate record(s) for ${domain}. This is an ADVISORY signal only.`,
      );
    } else {
      setStatus(
        "none",
        "No Certz records",
        `The Certz registry has no certificates for ${domain}.`,
      );
    }
  } catch (e) {
    setStatus("warn", "Lookup failed", e.message);
  }
}

main();
