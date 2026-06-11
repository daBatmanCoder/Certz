import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
import {
  AlgorithmIdentifier,
  AttributeTypeAndValue,
  AttributeValue,
  BasicConstraints,
  Certificate,
  Extension,
  Extensions,
  ExtendedKeyUsage,
  GeneralName,
  Name,
  RelativeDistinguishedName,
  SubjectAlternativeName,
  SubjectPublicKeyInfo,
  TBSCertificate,
  Validity,
} from "@peculiar/asn1-x509";
import { ObjectIdentifier } from "asn1js";
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { OID } from "./oids.js";
import type { CertzSigner } from "./signer.js";

function u8ToAb(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** Decompress a 33-byte SEC1 compressed P-256 point to the 65-byte uncompressed form. */
export function decompressP256(compressed: Uint8Array): Uint8Array {
  const point = p256.ProjectivePoint.fromHex(bytesToHex(compressed));
  return point.toRawBytes(false); // uncompressed: 0x04 || X || Y
}

function makeName(cn: string, organization?: string): Name {
  const rdns: RelativeDistinguishedName[] = [];
  if (organization) {
    rdns.push(
      new RelativeDistinguishedName([
        new AttributeTypeAndValue({
          type: OID.ORGANIZATION,
          value: new AttributeValue({ utf8String: organization }),
        }),
      ]),
    );
  }
  rdns.push(
    new RelativeDistinguishedName([
      new AttributeTypeAndValue({
        type: OID.COMMON_NAME,
        value: new AttributeValue({ utf8String: cn }),
      }),
    ]),
  );
  return new Name(rdns);
}

function ecdsaWithSha256(): AlgorithmIdentifier {
  return new AlgorithmIdentifier({ algorithm: OID.ECDSA_WITH_SHA256 });
}

function ecPublicKeySpki(compressedPubKey: Uint8Array): SubjectPublicKeyInfo {
  const curveParams = ecNamedCurveParameters();
  const uncompressed = decompressP256(compressedPubKey);
  return new SubjectPublicKeyInfo({
    algorithm: new AlgorithmIdentifier({
      algorithm: OID.EC_PUBLIC_KEY,
      parameters: curveParams,
    }),
    subjectPublicKey: u8ToAb(uncompressed),
  });
}

function ecNamedCurveParameters(): ArrayBuffer {
  return new ObjectIdentifier({ value: OID.P256_CURVE }).toBER(false);
}

function randomSerial(): ArrayBuffer {
  const bytes = p256.utils.randomPrivateKey().slice(0, 16);
  bytes[0] &= 0x7f; // keep the INTEGER positive
  return u8ToAb(bytes);
}

export interface TbsOptions {
  subjectCommonName: string;
  issuerCommonName: string;
  /** 33-byte SEC1 compressed P-256 public key that the certificate binds. */
  subjectPublicKeyCompressed: Uint8Array;
  validityDays: number;
  isCa: boolean;
  /** DNS names for the Subject Alternative Name extension (leaf certs). */
  dnsNames?: string[];
  organization?: string;
  notBefore?: Date;
}

export interface BuildCertOptions extends TbsOptions {
  /** The CA signer that authenticates this certificate. */
  signer: CertzSigner;
}

export interface BuiltTbs {
  tbs: TBSCertificate;
  tbsDer: Uint8Array;
  /** SHA-256 digest of the TBSCertificate -- the value the CA signs and the registry anchors. */
  digest: Uint8Array;
  digestHex: string;
  notBefore: Date;
  notAfter: Date;
}

export interface AssembledCertificate {
  der: Uint8Array;
  pem: string;
  /** SHA-256 fingerprint of the DER certificate (the value we anchor on-chain). */
  fingerprint: Uint8Array;
  fingerprintHex: string;
}

function buildExtensions(opts: TbsOptions): Extensions {
  const extensions: Extension[] = [];

  extensions.push(
    new Extension({
      extnID: OID.EXT_BASIC_CONSTRAINTS,
      critical: true,
      extnValue: new OctetString(
        AsnConvert.serialize(new BasicConstraints({ cA: opts.isCa })),
      ),
    }),
  );

  if (!opts.isCa) {
    extensions.push(
      new Extension({
        extnID: OID.EXT_EXT_KEY_USAGE,
        critical: false,
        extnValue: new OctetString(
          AsnConvert.serialize(new ExtendedKeyUsage([OID.EKU_SERVER_AUTH])),
        ),
      }),
    );

    if (opts.dnsNames && opts.dnsNames.length > 0) {
      const san = new SubjectAlternativeName(
        opts.dnsNames.map((name) => new GeneralName({ dNSName: name })),
      );
      extensions.push(
        new Extension({
          extnID: OID.EXT_SUBJECT_ALT_NAME,
          critical: false,
          extnValue: new OctetString(AsnConvert.serialize(san)),
        }),
      );
    }
  }

  return new Extensions(extensions);
}

/**
 * Build the TBSCertificate (the to-be-signed body) and its SHA-256 digest,
 * WITHOUT signing. This is the seam used by the on-chain flow: the digest is
 * what the requester pre-commits to and what the confidential CA signs.
 */
export function buildTbsCertificate(opts: TbsOptions): BuiltTbs {
  const notBefore = opts.notBefore ?? new Date();
  const notAfter = new Date(
    notBefore.getTime() + opts.validityDays * 24 * 60 * 60 * 1000,
  );

  const tbs = new TBSCertificate({
    version: 2, // v3
    serialNumber: randomSerial(),
    signature: ecdsaWithSha256(),
    issuer: makeName(opts.issuerCommonName),
    validity: new Validity({ notBefore, notAfter }),
    subject: makeName(opts.subjectCommonName, opts.organization),
    subjectPublicKeyInfo: ecPublicKeySpki(opts.subjectPublicKeyCompressed),
    extensions: buildExtensions(opts),
  });

  const tbsDer = new Uint8Array(AsnConvert.serialize(tbs));
  const digest = sha256(tbsDer);
  return {
    tbs,
    tbsDer,
    digest,
    digestHex: bytesToHex(digest),
    notBefore,
    notAfter,
  };
}

/**
 * Splice a DER ECDSA signature (from any CertzSigner, including the on-chain CA)
 * into a finished X.509 certificate.
 */
export function finalizeCertificate(
  tbs: TBSCertificate,
  signatureDer: Uint8Array,
): AssembledCertificate {
  const certificate = new Certificate({
    tbsCertificate: tbs,
    signatureAlgorithm: ecdsaWithSha256(),
    signatureValue: u8ToAb(signatureDer),
  });

  const der = new Uint8Array(AsnConvert.serialize(certificate));
  const fingerprint = sha256(der);
  return {
    der,
    pem: toPem(der, "CERTIFICATE"),
    fingerprint,
    fingerprintHex: bytesToHex(fingerprint),
  };
}

/**
 * Build a complete X.509 certificate. The body (TBSCertificate) is assembled and
 * DER-encoded locally, SHA-256 hashed, and signed by the provided `signer`
 * (which may be the confidential Sapphire CA). The returned DER ECDSA signature
 * is spliced straight into the certificate's `signatureValue`.
 */
export async function assembleCertificate(
  opts: BuildCertOptions,
): Promise<AssembledCertificate> {
  const built = buildTbsCertificate(opts);
  const signature = await opts.signer.signDigest(built.digest);
  return finalizeCertificate(built.tbs, signature);
}

/**
 * Build the self-signed Certz CA root certificate. The CA signer holds the key;
 * subject == issuer.
 */
export async function assembleCaRootCertificate(params: {
  signer: CertzSigner;
  commonName?: string;
  validityDays?: number;
}): Promise<AssembledCertificate> {
  const commonName = params.commonName ?? "Certz Confidential CA";
  const caPubKey = await params.signer.getCompressedPublicKey();
  // No Organization attribute: the CA subject DN must match the leaf issuer DN
  // exactly (CN only), or strict verifiers (e.g. OpenSSL) cannot build the chain.
  return assembleCertificate({
    subjectCommonName: commonName,
    issuerCommonName: commonName,
    subjectPublicKeyCompressed: caPubKey,
    signer: params.signer,
    validityDays: params.validityDays ?? 3650,
    isCa: true,
  });
}

/** Build a leaf (end-entity) certificate for one or more DNS names. */
export async function assembleLeafCertificate(params: {
  caSigner: CertzSigner;
  caCommonName?: string;
  domain: string;
  additionalDnsNames?: string[];
  subjectPublicKeyCompressed: Uint8Array;
  validityDays?: number;
}): Promise<AssembledCertificate> {
  const dnsNames = [params.domain, ...(params.additionalDnsNames ?? [])];
  return assembleCertificate({
    subjectCommonName: params.domain,
    issuerCommonName: params.caCommonName ?? "Certz Confidential CA",
    subjectPublicKeyCompressed: params.subjectPublicKeyCompressed,
    signer: params.caSigner,
    validityDays: params.validityDays ?? 90,
    isCa: false,
    dnsNames,
  });
}

export function toPem(der: Uint8Array, label: string): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
