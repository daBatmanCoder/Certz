// Certz deployment + trust anchor the extension reads from.
// Regenerate after redeploying with: npm run sync (in extension/).
export const CERTZ = {
  rpc: "https://testnet.sapphire.oasis.io",
  registry: "0x95D81e4B8D848A96ffe9112B9d054779c836B930",
  ca: "0x0BB607Caa6BBE66EF3986dfd3ffDa22eD52cb64E",
  // Function selectors (keccak256(sig)[:4]).
  selectors: {
    isValid: "0x6a938567", // isValid(bytes32) -> bool
    digestsForDomain: "0x2a4fe969", // digestsForDomain(string) -> bytes32[]
  },
  // The pinned Certz CA root. This is the extension's trust anchor (like a
  // browser root store entry). The site cannot override it -- it is checked
  // against the on-chain CA, not fetched from the site being verified.
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
};
