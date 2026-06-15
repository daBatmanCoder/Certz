// STEP 03 — Build the certificate body (TBSCertificate) and the digest the CA signs.
//
// Run:  npm run 03     (local; uses the subject key from step 01)
import {
  title, teach, section, kv, pass, toHex, short, fromHex, loadJson, saveJson, sdk,
} from "./_lib.mjs";

title("03", "What is INSIDE a certificate, and what actually gets signed");

teach(`
A certificate has two parts:

  • the "TBSCertificate" (To Be Signed) — the body: who the cert is for (subject),
    who issued it, the subject's public key, the validity window, and extensions
    like the list of domains (Subject Alternative Names).
  • the signature — the CA signing a HASH of that body.

This is the key insight people miss: the CA never signs "the certificate". It
signs the SHA-256 hash of the TBS body. That single 32-byte digest is the ONLY
thing sent to the TEE. Let's build a real TBS for a domain and compute that digest.
`);

const DOMAIN = process.env.CERTZ_DOMAIN ?? "demo.certz.example";
const subjectKey = loadJson("subject-key.json", "Run step 01 first (npm run 01).");

const { buildTbsCertificate } = await sdk();

section(`Building a TBSCertificate for "${DOMAIN}"`);
const built = buildTbsCertificate({
  subjectCommonName: DOMAIN,
  issuerCommonName: "Certz Confidential CA",
  subjectPublicKeyCompressed: fromHex(subjectKey.publicKeyCompressedHex),
  validityDays: 90,
  isCa: false,
  dnsNames: [DOMAIN],
});

kv("subject CN", DOMAIN);
kv("issuer CN", "Certz Confidential CA  (must match the CA root subject)");
kv("subject public key", short(subjectKey.publicKeyCompressedHex));
kv("SAN (domains)", DOMAIN);
kv("valid for", "90 days");
kv("TBS size", `${built.tbs ? "(structured)" : ""} digest below`);

section("The 32-byte digest the CA will sign");
kv("sha256(TBSCertificate)", "0x" + toHex(built.digest));

teach(`
Remember this digest. In the next step we hand exactly this value to the on-chain
CA. The CA signs it inside the TEE and gives back a signature — without ever
seeing (or caring) what the rest of your certificate looks like.
`);

// Persist the TBS digest + the exact TBS bytes so step 04 can request issuance
// for this body and step 05 can splice the returned signature into THIS body.
saveJson("tbs.json", {
  domain: DOMAIN,
  tbsDigestHex: "0x" + toHex(built.digest),
  tbsDerHex: toHex(built.tbsDer),
  notAfterUnix: Math.floor(built.notAfter.getTime() / 1000),
});

pass("You built a real certificate body and computed its signing digest. Saved tbs.json.");
teach("Next:  PRIVATE_KEY=<key> npm run 04   — request issuance + prove domain ownership.");
