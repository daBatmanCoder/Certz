import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Deploys the Certz CA stack to the configured network (Sapphire testnet by
 * default), bootstraps the confidential CA key inside the TEE, and produces the
 * self-signed CA root certificate. Writes addresses + the CA root PEM to
 * brain/contracts/deployments/<network>.json for the SDK / CLI / website.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(bal)} TEST`);

  console.log("\nDeploying CertRegistry...");
  const Registry = await ethers.getContractFactory("CertRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  console.log("  CertRegistry:", registryAddr);

  console.log("Deploying ConfidentialCA...");
  const CA = await ethers.getContractFactory("ConfidentialCA");
  const ca = await CA.deploy(registryAddr);
  await ca.waitForDeployment();
  const caAddr = await ca.getAddress();
  console.log("  ConfidentialCA:", caAddr);

  console.log("Wiring registry.setCA + bootstrap + devMode...");
  await (await registry.setCA(caAddr)).wait();
  await (await ca.bootstrap()).wait();
  await (await ca.setDevMode(true)).wait();

  const caPublicKey: string = await ca.caPublicKey();
  console.log("  CA public key (compressed):", caPublicKey);

  // Build + sign the self-signed CA root certificate.
  console.log("Building + signing CA root certificate...");
  const sdk = await import("../../sdk/dist/index.js");
  const caPubCompressed = ethers.getBytes(caPublicKey);
  const rootBuilt = sdk.buildTbsCertificate({
    subjectCommonName: "Certz Confidential CA",
    issuerCommonName: "Certz Confidential CA",
    subjectPublicKeyCompressed: caPubCompressed,
    validityDays: 3650,
    isCa: true,
  });
  const rootDigestHex = "0x" + Buffer.from(rootBuilt.digest).toString("hex");
  await (await ca.signRootCert(rootDigestHex)).wait();
  const rootSig: string = await ca.rootCertSignature();
  const rootCert = sdk.finalizeCertificate(
    rootBuilt.tbs,
    ethers.getBytes(rootSig),
  );

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    registry: registryAddr,
    ca: caAddr,
    caPublicKey,
    caRootPem: rootCert.pem,
  };

  const dir = join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  writeFileSync(join(dir, "certz-ca-root.pem"), rootCert.pem);

  console.log("\nDeployment complete. Saved to deployments/" + network.name + ".json");
  console.log("CA root certificate:\n" + rootCert.pem);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
