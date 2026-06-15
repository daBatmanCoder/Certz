import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";

/**
 * A Certz CA signer. Both implementations expose the SAME surface as the
 * on-chain `CertzCASigner` contract:
 *   - a 33-byte SEC1 compressed P-256 public key (contract: `caPublicKey`)
 *   - signDigest(sha256) -> ASN.1 DER ECDSA signature (contract: `caSign`)
 *
 * This is the seam that lets us prove the X.509 pipeline locally and then swap
 * in the confidential Sapphire signer without changing any assembly code.
 */
export interface CertzSigner {
  /** 33-byte SEC1 compressed P-256 public key. */
  getCompressedPublicKey(): Promise<Uint8Array>;
  /** Sign a 32-byte SHA-256 digest; returns an ASN.1 DER-encoded ECDSA signature. */
  signDigest(sha256Digest: Uint8Array): Promise<Uint8Array>;
}

/**
 * Generate a subject (end-entity) P-256 keypair. The domain owner keeps the
 * private key to use with their issued certificate; only the compressed public
 * key is embedded into the certificate and seen by the CA.
 */
export function generateSubjectKeyPair(): {
  privateKey: Uint8Array;
  publicKeyCompressed: Uint8Array;
} {
  const privateKey = p256.utils.randomPrivateKey();
  return { privateKey, publicKeyCompressed: p256.getPublicKey(privateKey, true) };
}

/**
 * Local P-256 signer used for tests and offline development. It mimics exactly
 * what Sapphire's `Sapphire.sign(Secp256r1PrehashedSha256, ...)` returns: a
 * low-S, DER-encoded ECDSA signature over the supplied digest.
 *
 * SECURITY: only for local proofs. The real CA key lives inside the TEE and is
 * never materialized in JS.
 */
export class LocalP256Signer implements CertzSigner {
  private readonly privateKey: Uint8Array;

  constructor(privateKey?: Uint8Array) {
    this.privateKey = privateKey ?? p256.utils.randomPrivateKey();
  }

  async getCompressedPublicKey(): Promise<Uint8Array> {
    return p256.getPublicKey(this.privateKey, true);
  }

  async signDigest(sha256Digest: Uint8Array): Promise<Uint8Array> {
    if (sha256Digest.length !== 32) {
      throw new Error("signDigest expects a 32-byte SHA-256 digest");
    }
    // `prehash: false` => treat input as the already-computed message hash,
    // matching the contract's prehashed signing algorithm. lowS is the noble
    // default and matches Sapphire's canonical output.
    const sig = p256.sign(sha256Digest, this.privateKey, { prehash: false });
    return sig.toDERRawBytes();
  }
}

/**
 * PROOF OF POSSESSION.
 *
 * The whole point of client-side verification: a site proves it currently holds
 * the private key for its Certz-issued certificate by signing a FRESH nonce
 * chosen by the verifier. Signing a fresh nonce (instead of a static blob) is
 * what makes this non-replayable — an attacker who merely copies the public
 * certificate cannot produce a valid signature over the verifier's new nonce.
 *
 * The site signs with its leaf PRIVATE key; the verifier checks with the leaf
 * PUBLIC key it extracted from the (CA-signed, on-chain-anchored) certificate.
 */
export function signChallenge(
  leafPrivateKey: Uint8Array,
  nonce: Uint8Array,
): { der: Uint8Array; compact: Uint8Array } {
  const digest = sha256(nonce);
  const sig = p256.sign(digest, leafPrivateKey, { prehash: false });
  return { der: sig.toDERRawBytes(), compact: sig.toCompactRawBytes() };
}

/**
 * Verify a proof-of-possession signature over `nonce` against a leaf public key.
 * Accepts the public key either compressed (33B) or uncompressed (65B), and the
 * signature either DER-encoded or compact (64B r||s) — whichever the site sent.
 */
export function verifyChallenge(
  leafPublicKey: Uint8Array,
  nonce: Uint8Array,
  signature: Uint8Array,
): boolean {
  const digest = sha256(nonce);
  const compact =
    signature.length === 64
      ? signature
      : p256.Signature.fromDER(signature).toCompactRawBytes();
  return p256.verify(compact, digest, leafPublicKey, {
    prehash: false,
    lowS: false,
  });
}
