// STEP 01 — Keys: the foundation of every certificate.
//
// Run:  npm run 01     (no network, no key needed)
import { title, teach, section, kv, pass, toHex, short, saveJson, sdk } from "./_lib.mjs";

title("01", "Public-key cryptography (the thing certificates are built on)");

teach(`
A TLS certificate is, at heart, a signed statement: "the holder of THIS public
key owns THIS domain." To understand Certz you only need three ideas:

  1. A keypair = a PRIVATE key (a secret number) + a PUBLIC key (derived from it).
     Anything signed by the private key can be checked by anyone with the public
     key, but you cannot go backwards from public to private.

  2. Certz uses the P-256 curve (a.k.a. secp256r1 / prime256v1) — the same curve
     browsers use for ECDSA TLS certificates. That is on purpose: it lets Certz
     produce REAL X.509 certificates, not a custom format.

  3. There are TWO keypairs in play:
       • the CA key  — owned by the certificate authority; signs certificates.
                       In Certz this key lives inside an Oasis Sapphire TEE and
                       is never revealed (we'll meet it in step 02).
       • the SUBJECT key — owned by YOU (the website). Its PUBLIC half goes inside
                       your certificate; its PRIVATE half stays on your server and
                       is what proves "I am really this site" (step 08).
`);

const { generateSubjectKeyPair } = await sdk();

section("Generating a subject (website) keypair, locally");
const kp = generateSubjectKeyPair();

teach(`
The private key is just a 32-byte random number. KEEP IT SECRET — whoever has it
can impersonate your site. The public key below is "compressed" SEC1 form: a
1-byte prefix (02/03 telling you which of two y-values) + the 32-byte x value.
`);

kv("private key (32 bytes)", short(toHex(kp.privateKey)) + "   <- secret!");
kv("public key (33 bytes)", toHex(kp.publicKeyCompressed));
kv("public key prefix", "0x" + toHex(kp.publicKeyCompressed.slice(0, 1)) + " (02/03 = compressed point)");

// Persist this subject key so later steps can build a real cert around it.
saveJson("subject-key.json", {
  privateKeyHex: toHex(kp.privateKey),
  publicKeyCompressedHex: toHex(kp.publicKeyCompressed),
});

pass("You generated a real P-256 keypair. Saved subject key to walkthrough/out/subject-key.json");
teach("Next:  npm run 02   — meet the on-chain CA whose key you can NEVER see.");
