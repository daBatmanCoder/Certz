/**
 * Public Certz deployment on Sapphire testnet.
 *
 * Everything here is PUBLIC (contract addresses, RPC, the CA root certificate).
 * The server signing key is NOT here — it is read from process.env on the server
 * only (see the /api routes). Mirror of brain/contracts/deployments/sapphire-testnet.json.
 */
export const DEPLOYMENT = {
  network: "sapphire-testnet",
  chainId: 23295,
  rpc: "https://testnet.sapphire.oasis.io",
  registry: "0x95D81e4B8D848A96ffe9112B9d054779c836B930",
  ca: "0x0BB607Caa6BBE66EF3986dfd3ffDa22eD52cb64E",
  /** The pinned Certz CA root — the verifier's trust anchor. */
  caRootPem: `-----BEGIN CERTIFICATE-----
MIIBUDCB96ADAgECAhAdzLo1qF3Br9jkNi0GzqKEMAoGCCqGSM49BAMCMCAxHjAc
BgNVBAMMFUNlcnR6IENvbmZpZGVudGlhbCBDQTAeFw0yNjA2MTEwODI4MDJaFw0z
NjA2MDgwODI4MDJaMCAxHjAcBgNVBAMMFUNlcnR6IENvbmZpZGVudGlhbCBDQTBZ
MBMGByqGSM49AgEGCCqGSM49AwEHA0IABFYvkDwA/aH5ebW/wr0VukJw0PLF6YxR
Ygk0Atkdw1wRKckzSxUxFB2ac/VDAIXVHKz5CKVm2LFm20gY4OSZgjyjEzARMA8G
A1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIgIAu1eclL5EQLjemP/1Rb
ezrkME904qt1iByIBx+4vG4CIQD5E0w+olBnq1VBYhNwmhlTHm1epXtxY98H2WOh
AtAdbQ==
-----END CERTIFICATE-----
`,
} as const;

/** Domains we treat as real (must pass real DNS-01) vs. demo placeholders. */
export function isDemoPlaceholderDomain(domain: string): boolean {
  return /\.(example|invalid|localhost|test)$/.test(domain) || domain.endsWith("certz.example");
}
