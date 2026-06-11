import { ethers, network } from "hardhat";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * End-to-end issuance against a deployed Certz CA:
 *   1. build a leaf TBSCertificate for a domain (subject keypair generated locally),
 *   2. requestCertificate -> DNS-01 challenge,
 *   3. (dev) devFulfill to simulate the ROFL oracle confirming DNS,
 *   4. read the confidential CA's DER signature, assemble the X.509 leaf,
 *   5. verify the chain off-chain and confirm the on-chain registry record.
 *
 * Run AFTER scripts/deploy.ts. Override domain with CERTZ_DOMAIN=foo.example.
 */
async function main() {
  const depPath = join(__dirname, "..", "deployments", `${network.name}.json`);
  const dep = JSON.parse(readFileSync(depPath, "utf8"));
  const domain = process.env.CERTZ_DOMAIN ?? "demo.certz.example";

  const ca = await ethers.getContractAt("ConfidentialCA", dep.ca);
  const registry = await ethers.getContractAt("CertRegistry", dep.registry);
  const sdk = await import("../../sdk/dist/index.js");

  console.log(`Issuing certificate for: ${domain}\n`);

  // 1. Subject keypair + leaf TBSCertificate.
  const subject = sdk.generateSubjectKeyPair();
  const leaf = sdk.buildTbsCertificate({
    subjectCommonName: domain,
    issuerCommonName: "Certz Confidential CA",
    subjectPublicKeyCompressed: subject.publicKeyCompressed,
    validityDays: 90,
    isCa: false,
    dnsNames: [domain],
  });
  const tbsDigestHex = "0x" + Buffer.from(leaf.digest).toString("hex");
  const notAfter = Math.floor(leaf.notAfter.getTime() / 1000);

  // 2. Request -> challenge (read from the ChallengeRequested event).
  const reqTx = await ca.requestCertificate(domain, tbsDigestHex, notAfter);
  const receipt = await reqTx.wait();
  const parsed = receipt!.logs
    .map((l) => {
      try {
        return ca.interface.parseLog(l as any);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "ChallengeRequested");
  if (!parsed) throw new Error("ChallengeRequested event not found");
  const requestId: string = parsed.args.requestId;
  const challenge: string = parsed.args.challenge;
  console.log("  requestId:", requestId);
  console.log("  challenge:", challenge);
  console.log(
    `  [production] publish DNS TXT  _certz-challenge.${domain} = ${challenge}\n`,
  );

  // 3. DEV: simulate the ROFL oracle confirming DNS and authorizing signing.
  console.log("  devFulfill (simulating ROFL TEE DNS verification)...");
  await (await ca.devFulfill(requestId)).wait();

  // 4. Read the confidential CA signature; assemble the leaf certificate.
  const sigHex: string = await ca.getSignature(requestId);
  const leafCert = sdk.finalizeCertificate(leaf.tbs, ethers.getBytes(sigHex));

  // 5a. Off-chain chain verification.
  const result = sdk.verifyCertzChain({
    leaf: leafCert.der,
    caRoot: dep.caRootPem,
    domain,
  });
  console.log("\n  Off-chain chain verification:", result.ok ? "PASS" : "FAIL");
  if (!result.ok) console.log("    reasons:", result.reasons);

  // 5b. On-chain registry checks.
  const isValid = await registry.isValid(tbsDigestHex);
  const record = await registry.getRecord(tbsDigestHex);
  console.log("  On-chain registry isValid:", isValid);
  console.log("  Registry record domain:", record.domain);

  const outDir = join(__dirname, "..", "deployments", "issued");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${domain}.pem`), leafCert.pem);
  writeFileSync(
    join(outDir, `${domain}.key.pem`),
    sdk.toPem(
      Buffer.from(
        // PKCS#8-ish dump is out of scope; store raw private key hex for the demo.
        subject.privateKey,
      ),
      "EC PRIVATE KEY (RAW DEMO)",
    ),
  );
  console.log(`\n  Saved leaf certificate to deployments/issued/${domain}.pem`);
  console.log("\nLeaf certificate:\n" + leafCert.pem);

  if (!result.ok || !isValid) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
