// SERVER-ONLY Certz helpers. Imported only by /api route handlers.
//
// The signing key (the CA contract owner, which pays gas and may devFulfill)
// is read from the environment and never reaches the browser.
import "server-only";
import { ethers } from "ethers";
import {
  wrapEthersSigner,
  wrapEthersProvider,
} from "@oasisprotocol/sapphire-ethers-v6";
import { DEPLOYMENT } from "./deployment";

const CA_ABI = [
  "function devMode() view returns (bool)",
  "function requestCertificate(string domain, bytes32 tbsSha256, uint64 notAfter) returns (bytes32, bytes32)",
  "function devFulfill(bytes32 requestId)",
  "function getSignature(bytes32 requestId) view returns (bytes)",
  "function getRequest(bytes32 requestId) view returns (tuple(string domain, bytes32 tbsSha256, bytes32 challenge, address requester, uint64 notAfter, bool exists, bool fulfilled))",
  "event ChallengeRequested(bytes32 indexed requestId, string domain, bytes32 challenge, address indexed requester)",
];
const REGISTRY_ABI = [
  "function isValid(bytes32 tbsSha256) view returns (bool)",
  "function getRecord(bytes32 tbsSha256) view returns (tuple(string domain, bytes32 tbsSha256, uint64 issuedAt, uint64 notAfter, bool revoked, bool exists))",
  "function digestsForDomain(string domain) view returns (bytes32[])",
];

// Raw provider, used for plain reads that don't touch confidential state
// (event log queries, public getters). Kept un-wrapped to avoid an extra
// runtime-public-key round-trip where confidentiality buys us nothing.
export function provider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(DEPLOYMENT.rpc);
}

// Sapphire-wrapped provider: transparently encrypts eth_call / eth_estimateGas
// calldata end-to-end with the ParaTime's ephemeral key.
export function sapphireProvider() {
  return wrapEthersProvider(new ethers.JsonRpcProvider(DEPLOYMENT.rpc));
}

function signerKey(): string {
  const k = process.env.CERTZ_SIGNER_KEY ?? process.env.PRIVATE_KEY;
  if (!k) {
    throw new Error(
      "Server signing key not configured. Set CERTZ_SIGNER_KEY in website/.env.local " +
        "(a funded Sapphire testnet key that owns the CA contract).",
    );
  }
  return k.startsWith("0x") ? k : `0x${k}`;
}

// Sapphire-wrapped signer: every state-changing tx (requestCertificate,
// devFulfill) is sent with ENCRYPTED calldata, so the RPC node / mempool /
// validators only see ciphertext. Look for the green lock on the explorer.
export function caWithSigner(): ethers.Contract {
  const signer = wrapEthersSigner(
    new ethers.Wallet(signerKey()).connect(provider()),
  );
  return new ethers.Contract(DEPLOYMENT.ca, CA_ABI, signer);
}

export function caRead(): ethers.Contract {
  return new ethers.Contract(DEPLOYMENT.ca, CA_ABI, sapphireProvider());
}

export function registryRead(): ethers.Contract {
  return new ethers.Contract(DEPLOYMENT.registry, REGISTRY_ABI, sapphireProvider());
}

export { ethers };
