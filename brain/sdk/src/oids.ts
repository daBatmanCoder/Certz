/** Object identifiers used when building Certz certificates. */
export const OID = {
  /** id-ecPublicKey */
  EC_PUBLIC_KEY: "1.2.840.10045.2.1",
  /** prime256v1 / secp256r1 (NIST P-256) */
  P256_CURVE: "1.2.840.10045.3.1.7",
  /** ecdsa-with-SHA256 */
  ECDSA_WITH_SHA256: "1.2.840.10045.4.3.2",
  /** Common Name (CN) */
  COMMON_NAME: "2.5.4.3",
  /** Organization (O) */
  ORGANIZATION: "2.5.4.10",
  /** X.509v3 Basic Constraints */
  EXT_BASIC_CONSTRAINTS: "2.5.29.19",
  /** X.509v3 Key Usage */
  EXT_KEY_USAGE: "2.5.29.15",
  /** X.509v3 Extended Key Usage */
  EXT_EXT_KEY_USAGE: "2.5.29.37",
  /** X.509v3 Subject Alternative Name */
  EXT_SUBJECT_ALT_NAME: "2.5.29.17",
  /** id-kp-serverAuth (TLS server) */
  EKU_SERVER_AUTH: "1.3.6.1.5.5.7.3.1",
} as const;
