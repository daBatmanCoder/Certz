import { AsnConvert } from "@peculiar/asn1-schema";
import {
  BasicConstraints,
  Certificate,
  SubjectAlternativeName,
  GeneralName,
  Time,
} from "@peculiar/asn1-x509";
import { p256 } from "@noble/curves/p256";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { OID } from "./oids.js";

export interface ParsedCertificate {
  der: Uint8Array;
  tbsDer: Uint8Array;
  /** 65-byte uncompressed P-256 public key bound by the certificate. */
  subjectPublicKey: Uint8Array;
  subjectCommonName?: string;
  issuerCommonName?: string;
  dnsNames: string[];
  notBefore: Date;
  notAfter: Date;
  isCa: boolean;
  fingerprintHex: string;
}

export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  // atob is available in browsers and Node >= 16, so this stays isomorphic.
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timeToDate(time: Time): Date {
  const d = time.utcTime ?? time.generalTime;
  if (!d) throw new Error("certificate Time has neither utcTime nor generalTime");
  return d;
}

function commonNameOf(name: Certificate["tbsCertificate"]["subject"]): string | undefined {
  for (const rdn of name) {
    for (const atv of rdn) {
      if (atv.type === OID.COMMON_NAME) {
        const v = atv.value;
        return v.utf8String ?? v.printableString ?? v.ia5String ?? undefined;
      }
    }
  }
  return undefined;
}

export function parseCertificate(input: Uint8Array | string): ParsedCertificate {
  const der = typeof input === "string" ? pemToDer(input) : input;
  const certificate = AsnConvert.parse(der, Certificate);
  const tbs = certificate.tbsCertificate;
  const tbsDer = new Uint8Array(AsnConvert.serialize(tbs));

  const dnsNames: string[] = [];
  let isCa = false;
  for (const ext of tbs.extensions ?? []) {
    if (ext.extnID === OID.EXT_SUBJECT_ALT_NAME) {
      const san = AsnConvert.parse(ext.extnValue.buffer, SubjectAlternativeName);
      for (const gn of san as unknown as GeneralName[]) {
        if (gn.dNSName) dnsNames.push(gn.dNSName);
      }
    }
    if (ext.extnID === OID.EXT_BASIC_CONSTRAINTS) {
      const bc = AsnConvert.parse(ext.extnValue.buffer, BasicConstraints);
      isCa = bc.cA === true;
    }
  }

  return {
    der,
    tbsDer,
    subjectPublicKey: new Uint8Array(tbs.subjectPublicKeyInfo.subjectPublicKey),
    subjectCommonName: commonNameOf(tbs.subject),
    issuerCommonName: commonNameOf(tbs.issuer),
    dnsNames,
    notBefore: timeToDate(tbs.validity.notBefore),
    notAfter: timeToDate(tbs.validity.notAfter),
    isCa,
    fingerprintHex: bytesToHex(sha256(der)),
  };
}

/** Verify that `cert` was signed by the private key matching `issuerPublicKey`. */
export function verifySignatureBy(
  cert: ParsedCertificate,
  issuerPublicKeyUncompressed: Uint8Array,
): boolean {
  const certificate = AsnConvert.parse(cert.der, Certificate);
  const sigDer = new Uint8Array(certificate.signatureValue);
  const digest = sha256(cert.tbsDer);
  // Sapphire/noble emit DER signatures; noble's verify wants compact (r||s).
  // lowS:false so we accept valid signatures regardless of S canonicalization
  // (X.509 does not require low-S; on-chain signers may emit either).
  const compact = p256.Signature.fromDER(sigDer).toCompactRawBytes();
  return p256.verify(compact, digest, issuerPublicKeyUncompressed, {
    prehash: false,
    lowS: false,
  });
}

export interface ChainVerificationResult {
  ok: boolean;
  reasons: string[];
  leaf: ParsedCertificate;
  caRoot: ParsedCertificate;
}

/**
 * Verify a Certz leaf certificate end to end:
 *  - leaf signature is valid under the CA root key,
 *  - CA root is a valid self-signed CA,
 *  - the leaf is within its validity window,
 *  - the domain is present in the leaf's SAN.
 *
 * This is the OUT-OF-BAND check (DANE/CT-style). It does not, and cannot,
 * change what a browser's TLS stack trusts.
 */
export function verifyCertzChain(params: {
  leaf: Uint8Array | string;
  caRoot: Uint8Array | string;
  domain: string;
  now?: Date;
}): ChainVerificationResult {
  const reasons: string[] = [];
  const leaf = parseCertificate(params.leaf);
  const caRoot = parseCertificate(params.caRoot);
  const now = params.now ?? new Date();

  if (!caRoot.isCa) reasons.push("CA root certificate is not marked as a CA");

  if (!verifySignatureBy(caRoot, caRoot.subjectPublicKey)) {
    reasons.push("CA root self-signature is invalid");
  }

  if (!verifySignatureBy(leaf, caRoot.subjectPublicKey)) {
    reasons.push("leaf signature does not verify under the CA root key");
  }

  if (leaf.issuerCommonName !== caRoot.subjectCommonName) {
    reasons.push("leaf issuer does not match CA root subject");
  }

  if (now < leaf.notBefore || now > leaf.notAfter) {
    reasons.push("leaf certificate is outside its validity window");
  }

  const domainMatch =
    leaf.dnsNames.includes(params.domain) ||
    leaf.subjectCommonName === params.domain;
  if (!domainMatch) {
    reasons.push(`domain ${params.domain} not present in leaf SAN/CN`);
  }

  return { ok: reasons.length === 0, reasons, leaf, caRoot };
}
