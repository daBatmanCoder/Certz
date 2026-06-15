import type {
  CertificatePem,
  CertzBackend,
  Domain,
  DnsChallenge,
  IssuedCertificate,
  RegistryRecord,
  VerificationResult,
} from "./types";

/**
 * The Certz data-layer contract.
 *
 * Both the in-browser mock and a future Sapphire-backed implementation satisfy
 * this interface, so UI code never needs to know which backend is live.
 *
 * A real implementation (see `// TODO: SapphireCertzClient` in mockClient.ts)
 * will:
 *   - call the on-chain CA contract on Oasis Sapphire for issuance/signing,
 *   - read the public transparency registry contract for records/status,
 *   - rely on the ROFL TEE oracle to attest DNS-01 ownership before signing.
 */
export interface CertzClient {
  /** Identifies which backend is currently serving requests. */
  readonly backend: CertzBackend;

  /**
   * Step 1 -> 2: begin issuance for a domain and return the DNS-01 challenge
   * the caller must publish to prove ownership.
   */
  requestChallenge(domain: Domain): Promise<DnsChallenge>;

  /**
   * Step 3 -> 5: ask Certz to verify the published TXT record (via the ROFL TEE
   * oracle) and, if ownership checks out, have the confidential CA sign and
   * anchor the certificate on-chain.
   *
   * Rejects with an Error if the DNS-01 challenge cannot be verified.
   */
  checkAndIssue(challengeId: string): Promise<IssuedCertificate>;

  /** Look up the public on-chain registry record for a domain, if any. */
  getRegistryRecord(domain: Domain): Promise<RegistryRecord | null>;

  /**
   * Out-of-band verification of a presented certificate against the Certz CA
   * root and the on-chain registry (DANE / CT style). Does not throw on a
   * failed certificate — failures are returned as individual checks.
   */
  verifyCertificate(
    pem: CertificatePem,
    domain: Domain,
  ): Promise<VerificationResult>;
}
