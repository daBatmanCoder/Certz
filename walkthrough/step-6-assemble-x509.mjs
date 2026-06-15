// STEP 6 -- Assemble the real X.509 certificate.
//
// A certificate is just: the TBS body + which algorithm signed it + the
// signature bytes. We have the TBS (step 2) and the signature (step 5), so we
// splice them together into a standards-compliant X.509 certificate that any
// tool (OpenSSL, browsers' parsers, etc.) can read.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { finalizeCertificateFromTbsDer } from "../brain/sdk/dist/index.js";
import { heading, explain, kv, ok, done, needState, saveState, fromHex, __dirname } from "./lib.mjs";

heading(6, "Assemble the X.509 certificate");
explain(
  "Splice the TEE signature into the TBS body. The output is a normal PEM\n" +
  "certificate -- the same shape Let's Encrypt would hand you.",
);

const tbsDer = fromHex(needState("tbsDer"));
const signatureDer = fromHex(needState("signatureDer"));

const cert = finalizeCertificateFromTbsDer(tbsDer, signatureDer);
kv("DER size", `${cert.der.length} bytes`);
kv("Fingerprint", "0x" + cert.fingerprintHex);
ok("Built a finished X.509 certificate.");

const outDir = join(__dirname, "out");
mkdirSync(outDir, { recursive: true });
const domain = needState("domain");
const certPath = join(outDir, `${domain}.pem`);
writeFileSync(certPath, cert.pem);
ok(`Wrote ${certPath}`);

console.log("\n" + cert.pem);

saveState({ certPem: cert.pem });
done(6);
