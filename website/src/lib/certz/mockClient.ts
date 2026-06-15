import type { CertzClient } from "./client";
import type {
  CertificatePem,
  Domain,
  DnsChallenge,
  IssuedCertificate,
  RegistryRecord,
  VerificationCheck,
  VerificationResult,
} from "./types";

/*
 * MockCertzClient
 * ----------------
 * A fully in-browser simulation of the Certz flow. It exists so the UI is
 * functional before the Sapphire contracts are deployed. NOTHING here touches
 * a real chain or TEE — tokens, certificates and registry records are
 * fabricated locally and persisted to localStorage so /create and /verify can
 * share state across navigations and reloads.
 *
 * Mock conventions (NOT how real X.509 works — a real client parses ASN.1):
 *   - A "certificate" is a base64-wrapped JSON metadata block between the
 *     standard PEM armor lines. verifyCertificate base64-decodes it to inspect
 *     issuer / validity / SANs, exactly the kind of fields a real parser would
 *     surface from a DER certificate.
 *   - "Signed by the CA" is approximated by matching a well-known CA key id +
 *     issuer string. A real client verifies the signature against the on-chain
 *     CA root public key.
 *
 * // TODO: SapphireCertzClient
 * A real implementation will satisfy the same `CertzClient` interface and:
 *   - submit issuance requests to the confidential CA contract on Oasis
 *     Sapphire (signing happens inside the TEE; the key never leaves it),
 *   - read the public transparency registry contract for records / status,
 *   - depend on the ROFL TEE oracle to attest DNS-01 ownership before signing.
 * The contract ABIs and deployed addresses will come from the
 * `brain/contracts` deployment artifacts (Sapphire testnet).
 */

const STORAGE_KEY = "certz.mock.registry.v1";
const CHALLENGE_TTL_SECONDS = 60 * 30; // 30 minutes
const CERT_VALIDITY_SECONDS = 60 * 60 * 24 * 90; // 90 days

/** Well-known identity of the mock confidential CA root. */
const MOCK_CA = {
  issuer: "Certz Confidential CA",
  keyId: "certz-sapphire-testnet-ca-0001",
} as const;

interface StoredState {
  /** Issued certificates keyed by their certificate digest. */
  recordsByDigest: Record<string, RegistryRecord>;
  /** Latest issuance per domain (for quick lookups in /verify and /create). */
  digestByDomain: Record<Domain, string>;
}

interface PendingChallenge extends DnsChallenge {
  /** Metadata captured at request time so issuance is deterministic. */
  createdAt: number;
}

/** In-memory challenge table (challenges are ephemeral, no need to persist). */
const pendingChallenges = new Map<string, PendingChallenge>();

const now = () => Math.floor(Date.now() / 1000);

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(input: string): string {
  if (typeof btoa === "function") return btoa(input);
  return Buffer.from(input, "utf-8").toString("base64");
}

function fromBase64(input: string): string {
  if (typeof atob === "function") return atob(input);
  return Buffer.from(input, "base64").toString("utf-8");
}

/** SHA-256 hex digest, with a deterministic non-crypto fallback for SSR. */
async function sha256Hex(input: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(input);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  }
  // Fallback: FNV-1a expanded to 64 hex chars. Only used in non-crypto envs.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

function normalizeDomain(domain: string): Domain {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;

function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(normalizeDomain(domain));
}

function wrapPem(body: string): CertificatePem {
  const lines = body.match(/.{1,64}/g) ?? [body];
  return [
    "-----BEGIN CERTIFICATE-----",
    ...lines,
    "-----END CERTIFICATE-----",
  ].join("\n");
}

/** Decoded shape of a mock certificate's embedded metadata block. */
interface MockCertPayload {
  v: 1;
  issuer: string;
  caKeyId: string;
  subject: Domain;
  san: Domain[];
  serial: string;
  notBefore: number;
  notAfter: number;
  /** Mock "signature" — derived from the CA key id; not cryptographically real. */
  sig: string;
}

function buildMockCertificate(payload: MockCertPayload): CertificatePem {
  return wrapPem(toBase64(JSON.stringify(payload)));
}

function parseMockCertificate(pem: string): MockCertPayload | null {
  const match = pem.match(
    /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/,
  );
  if (!match) return null;
  const body = match[1].replace(/\s+/g, "");
  try {
    const json = fromBase64(body);
    const parsed = JSON.parse(json) as MockCertPayload;
    if (parsed?.v !== 1 || typeof parsed.subject !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadState(): StoredState {
  if (typeof window === "undefined") {
    return { recordsByDigest: {}, digestByDomain: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { recordsByDigest: {}, digestByDomain: {} };
    return JSON.parse(raw) as StoredState;
  } catch {
    return { recordsByDigest: {}, digestByDomain: {} };
  }
}

function saveState(state: StoredState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / unavailable storage in the mock.
  }
}

export class MockCertzClient implements CertzClient {
  readonly backend = "mock" as const;

  async requestChallenge(domain: Domain): Promise<DnsChallenge> {
    await delay(450);
    const normalized = normalizeDomain(domain);
    if (!isValidDomain(normalized)) {
      throw new Error(
        `"${domain}" is not a valid domain name. Use something like example.com.`,
      );
    }

    const challenge: PendingChallenge = {
      domain: normalized,
      recordName: `_certz-challenge.${normalized}`,
      recordType: "TXT",
      token: `certz-${randomHex(24)}`,
      challengeId: `chal_${randomHex(8)}`,
      expiresAt: now() + CHALLENGE_TTL_SECONDS,
      createdAt: now(),
    };
    pendingChallenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  async checkAndIssue(challengeId: string): Promise<IssuedCertificate> {
    // Simulate the round trip: ROFL TEE resolves DNS, then the CA signs.
    await delay(1600);

    const challenge = pendingChallenges.get(challengeId);
    if (!challenge) {
      throw new Error(
        "Unknown or expired challenge. Start the request again to get a fresh token.",
      );
    }
    if (now() > challenge.expiresAt) {
      pendingChallenges.delete(challengeId);
      throw new Error(
        "The DNS-01 challenge has expired. Start over to generate a new token.",
      );
    }

    const issuedAt = now();
    const notAfter = issuedAt + CERT_VALIDITY_SECONDS;
    const domain = challenge.domain;
    const san: Domain[] = [domain, `www.${domain}`];

    const payload: MockCertPayload = {
      v: 1,
      issuer: MOCK_CA.issuer,
      caKeyId: MOCK_CA.keyId,
      subject: domain,
      san,
      serial: randomHex(16),
      notBefore: issuedAt,
      notAfter,
      sig: randomHex(32),
    };

    const pem = buildMockCertificate(payload);
    const digest = await sha256Hex(pem);

    const record: RegistryRecord = {
      domain,
      certificateDigest: digest,
      notBefore: issuedAt,
      notAfter,
      status: "valid",
      subjectAltNames: san,
      issuedAtBlock: 1_200_000 + Math.floor(Math.random() * 50_000),
      issuanceTxHash: `0x${randomHex(32)}`,
    };

    const state = loadState();
    state.recordsByDigest[digest] = record;
    state.digestByDomain[domain] = digest;
    saveState(state);

    pendingChallenges.delete(challengeId);
    return { domain, pem, record };
  }

  async getRegistryRecord(domain: Domain): Promise<RegistryRecord | null> {
    await delay(300);
    const normalized = normalizeDomain(domain);
    const state = loadState();
    const digest = state.digestByDomain[normalized];
    if (!digest) return null;
    return state.recordsByDigest[digest] ?? null;
  }

  async verifyCertificate(
    pem: CertificatePem,
    domain: Domain,
  ): Promise<VerificationResult> {
    await delay(900);
    const normalized = normalizeDomain(domain);
    const checks: VerificationCheck[] = [];

    const parsed = parseMockCertificate(pem);
    checks.push({
      id: "parsed",
      label: "Certificate parses as a valid X.509 PEM",
      passed: !!parsed,
      detail: parsed
        ? "Decoded the PEM body and read the certificate fields."
        : "Could not decode a certificate from the provided PEM block.",
    });

    if (!parsed) {
      return { domain: normalized, ok: false, checks };
    }

    const signedByCa =
      parsed.issuer === MOCK_CA.issuer && parsed.caKeyId === MOCK_CA.keyId;
    checks.push({
      id: "signed-by-ca",
      label: "Signed by the Certz confidential CA",
      passed: signedByCa,
      detail: signedByCa
        ? `Issuer "${parsed.issuer}" matches the on-chain CA root (${parsed.caKeyId}).`
        : `Issuer "${parsed.issuer}" does not match the Certz CA root.`,
    });

    const ts = now();
    const withinValidity = ts >= parsed.notBefore && ts <= parsed.notAfter;
    checks.push({
      id: "within-validity",
      label: "Within its validity window",
      passed: withinValidity,
      detail: withinValidity
        ? `Valid until ${new Date(parsed.notAfter * 1000).toUTCString()}.`
        : `Outside the notBefore/notAfter window (expires ${new Date(
            parsed.notAfter * 1000,
          ).toUTCString()}).`,
    });

    const domainInSan =
      parsed.subject === normalized || parsed.san.includes(normalized);
    checks.push({
      id: "domain-in-san",
      label: `Domain "${normalized}" is covered by the certificate`,
      passed: domainInSan,
      detail: domainInSan
        ? `Found in the subject / SAN list: ${parsed.san.join(", ")}.`
        : `"${normalized}" is not in the certificate SANs (${parsed.san.join(", ")}).`,
    });

    const digest = await sha256Hex(pem);
    const state = loadState();
    const record = state.recordsByDigest[digest];
    const inRegistry = !!record;
    checks.push({
      id: "in-registry",
      label: "Present in the on-chain transparency registry",
      passed: inRegistry,
      detail: inRegistry
        ? `Anchored on-chain (digest ${digest.slice(0, 16)}…).`
        : "No registry entry matches this certificate's digest.",
    });

    const notRevoked = !!record && record.status !== "revoked";
    checks.push({
      id: "not-revoked",
      label: "Not revoked",
      passed: notRevoked,
      detail: !record
        ? "No registry record to check revocation against."
        : record.status === "revoked"
          ? "This certificate has been revoked on-chain."
          : "Registry status is active (not revoked).",
    });

    const ok = checks.every((c) => c.passed);
    return { domain: normalized, ok, checks, record };
  }
}
