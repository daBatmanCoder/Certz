// STEP 05 — Assemble the finished X.509 certificate.
//
// Run:  npm run 05     (local; uses outputs from steps 03 + 04)
import {
  title, teach, section, kv, pass, toHex, fromHex,
  loadJson, saveArtifact, sdk,
} from "./_lib.mjs";

title("05", "Assemble the certificate (body + the CA's signature)");

teach(`
You now have the two halves:
  • the TBS body you built in step 03, and
  • the DER signature the on-chain CA produced in step 04.

A certificate is literally just those two glued together in a standard ASN.1/DER
wrapper. That's what we do here. The result is a normal X.509 certificate that
tools like OpenSSL (step 06) can parse — there is nothing proprietary about it.
`);

const tbs = loadJson("tbs.json", "Run step 03 first.");
const issuance = loadJson("issuance.json", "Run step 04 first (PRIVATE_KEY=... npm run 04).");
const subjectKey = loadJson("subject-key.json", "Run step 01 first.");

const { finalizeCertificateFromTbsDer, toPem } = await sdk();

section("Splicing TBS body + CA signature into a certificate");
const cert = finalizeCertificateFromTbsDer(
  fromHex(tbs.tbsDerHex),
  fromHex(issuance.signatureDerHex),
);

kv("domain", tbs.domain);
kv("cert size", `${cert.der.length} bytes (DER)`);
kv("DER fingerprint", "0x" + cert.fingerprintHex.slice(0, 24) + "…");

const certPath = saveArtifact(`${tbs.domain}.pem`, cert.pem);
// Save the matching private key so step 08 can prove possession.
const keyPem = toPem(fromHex(subjectKey.privateKeyHex), "EC PRIVATE KEY (RAW DEMO)");
saveArtifact(`${tbs.domain}.key.pem`, keyPem);

section("Your certificate (PEM)");
console.log("\n" + cert.pem.trimEnd() + "\n");

pass(`Wrote ${tbs.domain}.pem (+ .key.pem) to walkthrough/out/.`);
teach("Next:  npm run 06   — verify the chain (and cross-check with OpenSSL).");
