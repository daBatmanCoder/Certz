import { CERTZ } from "./config.js";
import { parseCertificate, verifyCertzChain, verifyChallenge } from "./vendor/certz.js";

const $ = (id) => document.getElementById(id);
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const fmtDate = (date) =>
  new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
const shortHex = (value, left = 12, right = 10) =>
  value && value.length > left + right + 3 ? `${value.slice(0, left)}...${value.slice(-right)}` : value;

window.addEventListener("error", (event) => {
  event.preventDefault();
  console.error(event.error ?? event.message);
  renderUnavailable("Verifier error", event.error?.message ?? event.message ?? "Unexpected extension error.");
});

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  console.error(event.reason);
  renderUnavailable("Verifier error", event.reason?.message ?? "Unexpected extension error.");
});

function setOverall(kind, title, detail) {
  $("status").className = `status ${kind}`;
  $("lock").className = `lock ${kind}`;
  $("lock").textContent = kind === "ok" ? "✓" : kind === "warn" ? "!" : kind === "pending" ? "…" : "×";
  $("status-title").textContent = title;
  $("status-detail").textContent = detail;
}

function setStep(id, state, text) {
  const el = $(id);
  el.className = `step ${state}`;
  el.querySelector(".step-state").textContent =
    state === "ok" ? "✓" : state === "bad" ? "✗" : state === "skip" ? "–" : "…";
  el.querySelector(".step-text").textContent = text;
}

function resetDetails() {
  $("details").className = "details";
  ["d-subject", "d-issuer", "d-san", "d-from", "d-until", "d-fingerprint", "d-tbs", "d-registry", "d-nonce"].forEach((id) =>
    setDetail(id, "—"),
  );
}

function renderUnavailable(title, detail) {
  resetDetails();
  setStep("s-fetch", "bad", detail);
  ["s-chain", "s-registry", "s-pop"].forEach((id) => setStep(id, "skip", "skipped"));
  setOverall("none", title, detail);
}

async function fetchText(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await response.text().catch(() => "");
    return { response, text };
  } finally {
    clearTimeout(timer);
  }
}

/** eth_call to the registry. */
async function ethCall(to, data) {
  const res = await fetch(CERTZ.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hex(new Uint8Array(digest));
}

function setDetail(id, value) {
  $(id).textContent = value || "—";
}

function showCertDetails(parsed, tbsHex) {
  $("details").className = "details open";
  setDetail("d-subject", parsed.subjectCommonName);
  setDetail("d-issuer", parsed.issuerCommonName);
  setDetail("d-san", parsed.dnsNames.join(", "));
  setDetail("d-from", fmtDate(parsed.notBefore));
  setDetail("d-until", fmtDate(parsed.notAfter));
  setDetail("d-fingerprint", shortHex(parsed.fingerprintHex));
  setDetail("d-tbs", shortHex(`0x${tbsHex}`));
  setDetail("d-registry", shortHex(CERTZ.registry));
}

$("details-toggle").addEventListener("click", () => {
  $("details").classList.toggle("collapsed");
});

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = "";
  let domain = "";
  try {
    const u = new URL(tab.url);
    if (!["http:", "https:"].includes(u.protocol)) {
      $("domain").textContent = u.protocol.replace(":", "");
      setOverall("warn", "Unsupported page", "Open a normal http/https website tab, then reopen Certz.");
      ["s-fetch", "s-chain", "s-registry", "s-pop"].forEach((id) => setStep(id, "skip", "skipped"));
      return;
    }
    origin = u.origin;
    domain = u.hostname;
  } catch {
    setOverall("warn", "No site", "Open a website tab and reopen this popup.");
    return;
  }
  $("domain").textContent = domain;
  resetDetails();
  setOverall("pending", "Verifying…", `Checking ${domain}`);
  ["s-fetch", "s-chain", "s-registry", "s-pop"].forEach((id) => setStep(id, "pending", "waiting"));

  // 1. Fetch the site's advertised Certz certificate.
  let certPem;
  try {
    setStep("s-fetch", "pending", "fetching /.well-known/certz/certificate.pem");
    const { response, text } = await fetchText(`${origin}/.well-known/certz/certificate.pem`);
    if (!response.ok) {
      renderUnavailable("Not a Certz site", `${domain} did not return a Certz certificate (HTTP ${response.status}).`);
      return;
    }
    certPem = text.trim();
    if (!certPem.includes("BEGIN CERTIFICATE")) {
      renderUnavailable("Not a Certz site", `${domain} does not advertise a PEM Certz certificate.`);
      return;
    }
    setStep("s-fetch", "ok", "certificate fetched");
  } catch (e) {
    const reason = e.name === "AbortError" ? "request timed out" : e.message;
    renderUnavailable("Not a Certz site", `${domain} could not be checked for Certz (${reason}).`);
    return;
  }

  let parsed;
  try {
    parsed = parseCertificate(certPem);
  } catch (e) {
    setStep("s-chain", "bad", `certificate parse failed (${e.message})`);
    ["s-registry", "s-pop"].forEach((id) => setStep(id, "skip", "skipped"));
    setOverall("warn", "Invalid Certz certificate", `${domain} served a PEM block, but it is not a parseable X.509 certificate.`);
    return;
  }

  // 2. CA chain: signed by the pinned Certz CA root, valid window, SAN match.
  let chain;
  try {
    chain = verifyCertzChain({ leaf: certPem, caRoot: CERTZ.caRootPem, domain });
  } catch (e) {
    setStep("s-chain", "bad", `CA verification failed (${e.message})`);
    ["s-registry", "s-pop"].forEach((id) => setStep(id, "skip", "skipped"));
    setOverall("warn", "Verification failed", "The Certz certificate could not be checked against the pinned CA root.");
    return;
  }
  setStep("s-chain", chain.ok ? "ok" : "bad", chain.ok ? "signed by Certz CA, SAN matches" : chain.reasons[0]);

  // 3. On-chain registry: the TBS digest must be recorded and not revoked.
  let onChainValid = false;
  let tbsHex = "";
  try {
    tbsHex = await sha256Hex(parsed.tbsDer);
    showCertDetails(parsed, tbsHex);
    const data = CERTZ.selectors.isValid + tbsHex;
    const result = await ethCall(CERTZ.registry, data);
    onChainValid = /[1-9a-f]/.test((result || "").replace(/^0x0+/, ""));
    setStep("s-registry", onChainValid ? "ok" : "bad", onChainValid ? "recorded on-chain, not revoked" : "not in on-chain registry");
  } catch (e) {
    setStep("s-registry", "bad", `registry lookup failed (${e.message})`);
  }

  // 4. Proof of possession: site signs a FRESH nonce with its leaf key.
  let possession = false;
  try {
    setStep("s-pop", "pending", "challenging the site to sign a nonce");
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const { response, text } = await fetchText(`${origin}/.well-known/certz/sign?nonce=${hex(nonce)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = JSON.parse(text);
    if (typeof body.signature !== "string" || !/^[0-9a-fA-F]+$/.test(body.signature)) {
      throw new Error("invalid signature response");
    }
    const sig = Uint8Array.from(body.signature.match(/../g).map((h) => parseInt(h, 16)));
    possession = verifyChallenge(parsed.subjectPublicKey, nonce, sig);
    setDetail("d-nonce", possession ? `verified ${shortHex(hex(nonce), 10, 8)}` : "failed");
    setStep("s-pop", possession ? "ok" : "bad", possession ? "site holds the private key (fresh nonce)" : "signature did not verify");
  } catch (e) {
    setStep("s-pop", "bad", `no valid proof (${e.message})`);
    setDetail("d-nonce", "failed");
  }

  const all = chain.ok && onChainValid && possession;
  if (all) {
    setOverall("ok", "Certz verified", `${domain} presented a Certz certificate and proved it holds the key, anchored on-chain.`);
  } else if (chain.ok && onChainValid) {
    setOverall("warn", "Cert valid, possession unproven", `${domain} has a valid on-chain Certz cert, but did not prove it currently holds the key.`);
  } else {
    setOverall("warn", "Verification incomplete", "One or more checks failed — see details above.");
  }
}

main().catch((e) => {
  console.error(e);
  setOverall("bad", "Verifier crashed", e.message ?? "Unexpected extension error.");
});
