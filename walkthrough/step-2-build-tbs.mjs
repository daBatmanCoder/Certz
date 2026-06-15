// STEP 2 -- Build the unsigned certificate (the "TBSCertificate").
//
// Before anyone signs anything, YOU (the domain owner) decide what the
// certificate should say: which domain, which public key, how long it's valid.
// That bundle of facts is the "To Be Signed" certificate. Its SHA-256 digest is
// the exact 32 bytes the CA will sign -- nothing more, nothing less.
import { generateSubjectKeyPair, buildTbsCertificate } from "../brain/sdk/dist/index.js";
import { heading, explain, kv, ok, done, saveState, DOMAIN, toHex } from "./lib.mjs";

heading(2, "Build the unsigned certificate (TBSCertificate)");
explain(
  `We generate a fresh keypair for "${DOMAIN}" (the site's own key -- the CA never\n` +
  "sees the private half), then assemble the unsigned certificate body and hash it.",
);

// 1. The site's own keypair. The private key stays with the site forever; only
//    the public key goes into the certificate.
const subject = generateSubjectKeyPair();
kv("Domain", DOMAIN);
kv("Site public key", toHex(subject.publicKeyCompressed));
ok("Generated the site's P-256 keypair (private key stays local).");

// 2. The unsigned certificate body.
const built = buildTbsCertificate({
  subjectCommonName: DOMAIN,
  issuerCommonName: "Certz Confidential CA",
  subjectPublicKeyCompressed: subject.publicKeyCompressed,
  validityDays: 90,
  isCa: false,
  dnsNames: [DOMAIN],
});

kv("Valid from", built.notBefore.toISOString());
kv("Valid until", built.notAfter.toISOString());
kv("TBS digest", "0x" + built.digestHex);
ok("Built the TBSCertificate and computed its SHA-256 digest.");

explain(
  "\nThat TBS digest is the promise: 'sign exactly this'. In step 3 we hand the\n" +
  "digest to the CA contract and ask for a domain-ownership challenge.",
);

saveState({
  domain: DOMAIN,
  subjectPrivateKey: toHex(subject.privateKey),
  subjectPublicKeyCompressed: toHex(subject.publicKeyCompressed),
  tbsDer: toHex(built.tbsDer),
  tbsDigestHex: built.digestHex,
  notAfter: Math.floor(built.notAfter.getTime() / 1000),
});
done(2);
