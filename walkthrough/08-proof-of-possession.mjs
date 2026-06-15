// STEP 08 — Proof of possession: does the live site actually hold the private key?
//
// Run:  npm run 08     (local; uses outputs from steps 05)
import {
  title, teach, section, kv, pass, fail, toHex, fromHex, loadJson, loadArtifact, sdk,
} from "./_lib.mjs";

title("08", "The live check: prove the server holds the key (non-replayable)");

teach(`
Everything so far proves the CERTIFICATE is genuine. But an attacker could copy a
real, public certificate and serve it from their own server. So the final check
proves the server you're talking to RIGHT NOW actually holds the matching private
key.

How: the verifier (your browser / the extension) makes up a FRESH random nonce and
asks the site to sign it. The site signs with its leaf private key; the verifier
checks that signature against the public key inside the certificate.

Because the nonce is fresh every time, a copied certificate is useless — without
the private key you cannot answer a NEW challenge. This is exactly what the Certz
browser extension does against /.well-known/certz/sign.
`);

const tbs = loadJson("tbs.json", "Run step 03 first.");
const subjectKey = loadJson("subject-key.json", "Run step 01 first.");
const leafPem = loadArtifact(`${tbs.domain}.pem`, "Run step 05 first.");

const { parseCertificate, signChallenge, verifyChallenge, generateSubjectKeyPair } = await sdk();

const parsed = parseCertificate(leafPem);
const leafPrivateKey = fromHex(subjectKey.privateKeyHex);

section("1) Verifier picks a fresh random nonce");
const nonce = crypto.getRandomValues(new Uint8Array(32));
kv("nonce", "0x" + toHex(nonce));

section("2) The site signs it with its leaf PRIVATE key");
const sig = signChallenge(leafPrivateKey, nonce);
kv("signature (r‖s)", "0x" + toHex(sig.compact).slice(0, 32) + "…");

section("3) Verifier checks it against the cert's PUBLIC key");
const ok = verifyChallenge(parsed.subjectPublicKey, nonce, sig.compact);
kv("genuine proof", ok ? "ACCEPTED ✓" : "rejected");
if (!ok) fail("Genuine proof-of-possession failed (should never happen).");

section("4) Why it's safe — two attacks that MUST fail");
// Replay: reuse a valid signature against a DIFFERENT nonce.
const replay = verifyChallenge(parsed.subjectPublicKey, crypto.getRandomValues(new Uint8Array(32)), sig.compact);
kv("replayed old signature", replay ? "ACCEPTED (BAD!)" : "rejected ✓");
// Imposter: copy the public cert, sign the nonce with a DIFFERENT key.
const imposter = generateSubjectKeyPair();
const forged = signChallenge(imposter.privateKey, nonce);
const imposterOk = verifyChallenge(parsed.subjectPublicKey, nonce, forged.compact);
kv("imposter w/ wrong key", imposterOk ? "ACCEPTED (BAD!)" : "rejected ✓");

if (replay || imposterOk) fail("A bad proof was accepted — this would be a security hole.");

pass("Live proof-of-possession works, and both forgery attempts are rejected.");
teach(`
That's the whole Certz lifecycle, end to end and verified:
  keys → on-chain CA → cert body → TEE signing → assembly → chain → registry → live proof.
`);
