import {
  generateSubjectKeyPair,
  buildTbsCertificate,
  finalizeCertificateFromTbsDer,
  parseCertificate,
  verifySignatureBy,
  toPem,
  type BuiltTbs,
} from "@certz/sdk";
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
import { DEPLOYMENT } from "./deployment";

const CHALLENGE_TTL_SECONDS = 60 * 30;
const now = () => Math.floor(Date.now() / 1000);

function normalizeDomain(domain: string): Domain {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

interface PendingIssue {
  domain: Domain;
  built: BuiltTbs;
  privateKey: Uint8Array;
}

/**
 * The real Certz client.
 *
 * Cryptography (keygen, TBS assembly, certificate finalization, chain
 * verification, proof-of-possession) happens IN THE BROWSER via @certz/sdk. The
 * private key is generated here and never leaves the browser. On-chain
 * transactions (request / fulfill) and registry reads are performed by the
 * Next.js /api routes, which hold the server signing key and pay gas.
 */
export class SapphireCertzClient implements CertzClient {
  readonly backend = "sapphire" as const;
  private readonly pending = new Map<string, PendingIssue>();

  async requestChallenge(domain: Domain): Promise<DnsChallenge> {
    const normalized = normalizeDomain(domain);
    if (!DOMAIN_RE.test(normalized)) {
      throw new Error(`"${domain}" is not a valid domain name. Try example.com.`);
    }

    // Generate the site's keypair and build the unsigned certificate locally.
    const { privateKey, publicKeyCompressed } = generateSubjectKeyPair();
    const built = buildTbsCertificate({
      subjectCommonName: normalized,
      issuerCommonName: "Certz Confidential CA",
      subjectPublicKeyCompressed: publicKeyCompressed,
      validityDays: 90,
      isCa: false,
      dnsNames: [normalized],
    });
    const notAfter = Math.floor(built.notAfter.getTime() / 1000);

    const res = await fetch("/api/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain: normalized, tbsDigestHex: "0x" + built.digestHex, notAfter }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "challenge request failed");

    this.pending.set(data.requestId, { domain: normalized, built, privateKey });

    return {
      domain: normalized,
      recordName: `_certz-challenge.${normalized}`,
      recordType: "TXT",
      token: data.challenge,
      challengeId: data.requestId,
      expiresAt: now() + CHALLENGE_TTL_SECONDS,
    };
  }

  async checkAndIssue(challengeId: string): Promise<IssuedCertificate> {
    const pending = this.pending.get(challengeId);
    if (!pending) {
      throw new Error("No pending request in this session — start the request again.");
    }

    const res = await fetch("/api/issue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: challengeId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "issuance failed");

    // Splice the TEE signature into the certificate we built earlier.
    const cert = finalizeCertificateFromTbsDer(pending.built.tbsDer, hexToBytes(data.signatureDer));

    const record: RegistryRecord = {
      domain: data.domain,
      certificateDigest: data.record.tbsSha256,
      notBefore: Math.floor(pending.built.notBefore.getTime() / 1000),
      notAfter: data.record.notAfter,
      status: data.record.revoked ? "revoked" : "valid",
      subjectAltNames: [data.domain],
      issuanceTxHash: data.txHash,
    };

    return {
      domain: data.domain,
      pem: cert.pem,
      record,
      privateKeyPem: toPem(pending.privateKey, "EC PRIVATE KEY (RAW DEMO)"),
      demo: data.demo,
      dnsVerified: data.dnsVerified,
      txHash: data.txHash,
    };
  }

  async getRegistryRecord(domain: Domain): Promise<RegistryRecord | null> {
    const normalized = normalizeDomain(domain);
    const listRes = await fetch(`/api/registry?domain=${encodeURIComponent(normalized)}`);
    const list = await listRes.json();
    if (!listRes.ok || !Array.isArray(list.digests) || list.digests.length === 0) return null;

    const digest = list.digests[list.digests.length - 1];
    const recRes = await fetch(`/api/registry?digest=${digest}`);
    const rec = await recRes.json();
    if (!recRes.ok || !rec.record) return null;

    const expired = now() > rec.record.notAfter;
    return {
      domain: rec.record.domain,
      certificateDigest: digest,
      notBefore: rec.record.issuedAt,
      notAfter: rec.record.notAfter,
      status: rec.record.revoked ? "revoked" : expired ? "expired" : "valid",
      subjectAltNames: [rec.record.domain],
    };
  }

  async verifyCertificate(pem: CertificatePem, domain: Domain): Promise<VerificationResult> {
    const normalized = normalizeDomain(domain);
    const checks: VerificationCheck[] = [];

    let parsed: ReturnType<typeof parseCertificate> | null = null;
    try {
      parsed = parseCertificate(pem);
    } catch {
      parsed = null;
    }
    checks.push({
      id: "parsed",
      label: "Certificate parses as a valid X.509 PEM",
      passed: !!parsed,
      detail: parsed
        ? "Decoded the DER/ASN.1 structure and read the certificate fields."
        : "Could not decode a certificate from the provided PEM block.",
    });
    if (!parsed) return { domain: normalized, ok: false, checks };

    // Signed by the Certz CA root (real ECDSA verification, client-side).
    const caRoot = parseCertificate(DEPLOYMENT.caRootPem);
    let signedByCa = false;
    try {
      signedByCa = verifySignatureBy(parsed, caRoot.subjectPublicKey);
    } catch {
      signedByCa = false;
    }
    checks.push({
      id: "signed-by-ca",
      label: "Signed by the Certz confidential CA",
      passed: signedByCa,
      detail: signedByCa
        ? `Leaf signature verifies under the on-chain CA root key (issuer "${parsed.issuerCommonName}").`
        : "Leaf signature does not verify against the Certz CA root public key.",
    });

    const ts = now();
    const nb = Math.floor(parsed.notBefore.getTime() / 1000);
    const na = Math.floor(parsed.notAfter.getTime() / 1000);
    const withinValidity = ts >= nb && ts <= na;
    checks.push({
      id: "within-validity",
      label: "Within its validity window",
      passed: withinValidity,
      detail: withinValidity
        ? `Valid until ${parsed.notAfter.toUTCString()}.`
        : `Outside the notBefore/notAfter window (expires ${parsed.notAfter.toUTCString()}).`,
    });

    const domainMatch =
      parsed.dnsNames.includes(normalized) || parsed.subjectCommonName === normalized;
    checks.push({
      id: "domain-in-san",
      label: `Domain "${normalized}" is covered by the certificate`,
      passed: domainMatch,
      detail: domainMatch
        ? `Found in the subject/SAN: ${[...new Set([parsed.subjectCommonName, ...parsed.dnsNames].filter(Boolean))].join(", ")}.`
        : `"${normalized}" is not in the certificate's CN/SAN.`,
    });

    // On-chain registry: keyed by sha256(TBSCertificate).
    const tbsSha256 = "0x" + (await sha256Hex(parsed.tbsDer));
    let record: VerificationResult["record"];
    let inRegistry = false;
    let notRevoked = false;
    try {
      const res = await fetch(`/api/registry?digest=${tbsSha256}`);
      const data = await res.json();
      if (res.ok && data.record) {
        inRegistry = true;
        notRevoked = !data.record.revoked;
        record = {
          domain: data.record.domain,
          certificateDigest: tbsSha256,
          notBefore: data.record.issuedAt,
          notAfter: data.record.notAfter,
          status: data.record.revoked ? "revoked" : "valid",
          subjectAltNames: [data.record.domain],
        };
      }
    } catch {
      // leave inRegistry false
    }
    checks.push({
      id: "in-registry",
      label: "Present in the on-chain transparency registry",
      passed: inRegistry,
      detail: inRegistry
        ? `Anchored on Sapphire (digest ${tbsSha256.slice(0, 18)}…).`
        : "No registry entry matches this certificate's TBS digest.",
    });
    checks.push({
      id: "not-revoked",
      label: "Not revoked",
      passed: notRevoked,
      detail: !inRegistry
        ? "No registry record to check revocation against."
        : notRevoked
          ? "Registry status is active (not revoked)."
          : "This certificate has been revoked on-chain.",
    });

    const ok = checks.every((c) => c.passed);
    return { domain: normalized, ok, checks, record };
  }
}
