// Independent structural proof: build a Certz CA + leaf with the local signer,
// write PEMs, and let OpenSSL (a third-party X.509 implementation) parse and
// verify the chain. This guards against "it only verifies because we also built
// the verifier" by using a tool that knows nothing about Certz.
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { p256 } from "@noble/curves/p256";
import {
  LocalP256Signer,
  assembleCaRootCertificate,
  assembleLeafCertificate,
} from "../dist/index.js";

const dir = mkdtempSync(join(tmpdir(), "certz-"));
const caSigner = new LocalP256Signer();
const ca = await assembleCaRootCertificate({ signer: caSigner });
const userPub = p256.getPublicKey(p256.utils.randomPrivateKey(), true);
const leaf = await assembleLeafCertificate({
  caSigner,
  domain: "proof.certz.example",
  subjectPublicKeyCompressed: userPub,
});

const caPath = join(dir, "ca.pem");
const leafPath = join(dir, "leaf.pem");
writeFileSync(caPath, ca.pem);
writeFileSync(leafPath, leaf.pem);

console.log("Wrote:", caPath, leafPath);
console.log("CA fingerprint (sha256):", ca.fingerprintHex);
console.log("Leaf fingerprint (sha256):", leaf.fingerprintHex);
console.log("\nRun these to verify with OpenSSL:");
console.log(`  openssl x509 -in ${leafPath} -noout -text`);
console.log(`  openssl verify -CAfile ${caPath} ${leafPath}`);
