import { describe, it, expect } from "vitest";
import { p256 } from "@noble/curves/p256";
import {
  LocalP256Signer,
  assembleCaRootCertificate,
  assembleLeafCertificate,
  parseCertificate,
  verifyCertzChain,
} from "../src/index";

/**
 * Phase 1 proof, infrastructure-free.
 *
 * The LocalP256Signer mimics EXACTLY what the on-chain `CertzCASigner.caSign`
 * returns: a DER-encoded ECDSA-P256 signature over a SHA-256 digest. If a real
 * X.509 chain assembled from that primitive verifies, then swapping in the
 * Sapphire signer (same interface) yields real certificates issued by a key
 * that only ever existed inside the TEE.
 */
describe("Certz X.509 pipeline (signer -> cert -> verify)", () => {
  it("issues a CA root and a leaf cert that verify as a chain", async () => {
    const caSigner = new LocalP256Signer();
    const caRoot = await assembleCaRootCertificate({ signer: caSigner });

    // The domain owner generates their own keypair; only the public key is shared.
    const userPriv = p256.utils.randomPrivateKey();
    const userPubCompressed = p256.getPublicKey(userPriv, true);

    const leaf = await assembleLeafCertificate({
      caSigner,
      domain: "certz-demo.example",
      subjectPublicKeyCompressed: userPubCompressed,
    });

    const result = verifyCertzChain({
      leaf: leaf.der,
      caRoot: caRoot.der,
      domain: "certz-demo.example",
    });

    expect(result.reasons).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("parses back the expected fields from the leaf certificate", async () => {
    const caSigner = new LocalP256Signer();
    await assembleCaRootCertificate({ signer: caSigner });
    const userPub = p256.getPublicKey(p256.utils.randomPrivateKey(), true);

    const leaf = await assembleLeafCertificate({
      caSigner,
      domain: "shop.certz.example",
      subjectPublicKeyCompressed: userPub,
    });

    const parsed = parseCertificate(leaf.der);
    expect(parsed.subjectCommonName).toBe("shop.certz.example");
    expect(parsed.issuerCommonName).toBe("Certz Confidential CA");
    expect(parsed.dnsNames).toContain("shop.certz.example");
    expect(parsed.isCa).toBe(false);
    expect(parsed.fingerprintHex).toHaveLength(64);
  });

  it("rejects a leaf signed by a different (rogue) CA", async () => {
    const realCa = new LocalP256Signer();
    const rogueCa = new LocalP256Signer();
    const caRoot = await assembleCaRootCertificate({ signer: realCa });

    const userPub = p256.getPublicKey(p256.utils.randomPrivateKey(), true);
    const rogueLeaf = await assembleLeafCertificate({
      caSigner: rogueCa,
      domain: "victim.example",
      subjectPublicKeyCompressed: userPub,
    });

    const result = verifyCertzChain({
      leaf: rogueLeaf.der,
      caRoot: caRoot.der,
      domain: "victim.example",
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("leaf signature does not verify");
  });

  it("rejects a domain that is not in the certificate SAN", async () => {
    const caSigner = new LocalP256Signer();
    const caRoot = await assembleCaRootCertificate({ signer: caSigner });
    const userPub = p256.getPublicKey(p256.utils.randomPrivateKey(), true);

    const leaf = await assembleLeafCertificate({
      caSigner,
      domain: "real.example",
      subjectPublicKeyCompressed: userPub,
    });

    const result = verifyCertzChain({
      leaf: leaf.der,
      caRoot: caRoot.der,
      domain: "attacker.example",
    });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("attacker.example");
  });
});
