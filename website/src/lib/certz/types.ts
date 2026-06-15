/**
 * Shared types for the Certz data-layer.
 *
 * These model the real Certz flow:
 *   1. A caller requests a certificate for a domain.
 *   2. Certz returns a DNS-01 challenge (a TXT record to publish).
 *   3. A ROFL TEE oracle verifies the TXT record off-chain.
 *   4. The confidential on-chain CA (a Sapphire contract) signs an X.509 cert.
 *   5. The issuance is anchored in a public on-chain transparency registry.
 *   6. A presented cert can be verified out-of-band against the CA root +
 *      registry (DANE / Certificate-Transparency style).
 *
 * The shapes here intentionally avoid coupling to any specific chain/ABI so a
 * real Sapphire-backed client can implement the same interface later.
 */

/** A fully-qualified domain name, e.g. "api.example.com". */
export type Domain = string;

/** PEM-encoded X.509 certificate (the "-----BEGIN CERTIFICATE-----" block). */
export type CertificatePem = string;

/** Lifecycle status of a certificate as tracked in the on-chain registry. */
export type CertificateStatus = "valid" | "expired" | "revoked" | "unknown";

/**
 * The DNS-01 ownership challenge a caller must publish to prove control of a
 * domain. Mirrors the ACME DNS-01 model.
 */
export interface DnsChallenge {
  /** The domain being claimed. */
  domain: Domain;
  /** Fully-qualified TXT record name to create, e.g. "_certz-challenge.example.com". */
  recordName: string;
  /** DNS record type — always "TXT" for DNS-01. */
  recordType: "TXT";
  /** The exact token/value that must be set as the TXT record. */
  token: string;
  /** Opaque id used to correlate the challenge with a later issuance call. */
  challengeId: string;
  /** Unix epoch (seconds) after which the challenge token is no longer accepted. */
  expiresAt: number;
}

/**
 * A record in the public on-chain transparency registry. This is the auditable,
 * Certificate-Transparency-style anchor: domain -> certificate digest.
 */
export interface RegistryRecord {
  domain: Domain;
  /** Hex SHA-256 digest of the DER-encoded certificate (the on-chain anchor). */
  certificateDigest: string;
  /** Unix epoch (seconds) the certificate becomes valid. */
  notBefore: number;
  /** Unix epoch (seconds) the certificate expires. */
  notAfter: number;
  status: CertificateStatus;
  /** Subject Alternative Names covered by the certificate. */
  subjectAltNames: Domain[];
  /** Block number / height at which the issuance was recorded (if known). */
  issuedAtBlock?: number;
  /** Transaction hash of the on-chain issuance (if known). */
  issuanceTxHash?: string;
}

/** Result of a successful issuance. */
export interface IssuedCertificate {
  domain: Domain;
  pem: CertificatePem;
  record: RegistryRecord;
  /**
   * The subject (site) PRIVATE key, PEM-wrapped. Generated in the browser and
   * never sent to the server. The holder needs it to prove possession; keep it
   * secret. (Demo format: raw 32-byte P-256 scalar.)
   */
  privateKeyPem?: string;
  /** True when issued via the demo path (DNS-01 ownership simulated). */
  demo?: boolean;
  /** True when a real DNS-01 TXT record was confirmed before issuing. */
  dnsVerified?: boolean;
  /** Issuance transaction hash on Sapphire, if a tx was sent. */
  txHash?: string;
}

/** A single named check performed during out-of-band verification. */
export interface VerificationCheck {
  /** Stable machine id for the check. */
  id:
    | "parsed"
    | "signed-by-ca"
    | "within-validity"
    | "domain-in-san"
    | "in-registry"
    | "not-revoked";
  /** Human-readable label shown in the UI. */
  label: string;
  passed: boolean;
  /** Short explanation of why the check passed or failed. */
  detail: string;
}

/** Aggregate verification outcome for a presented certificate. */
export interface VerificationResult {
  domain: Domain;
  /** True only if every individual check passed. */
  ok: boolean;
  checks: VerificationCheck[];
  /** The matched registry record, if the cert was found on-chain. */
  record?: RegistryRecord;
}

/** Whether the active client is talking to real contracts or a simulation. */
export type CertzBackend = "mock" | "sapphire";
