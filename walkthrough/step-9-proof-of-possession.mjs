// STEP 9 -- Proof of possession (the client-side check).
//
// The certificate proves "Certz vouches that this PUBLIC key owns this domain".
// But a fraudster could copy your public certificate. The final check proves the
// server actually holds the matching PRIVATE key, RIGHT NOW: the verifier sends
// a fresh random nonce, the server signs it, and the verifier checks that
// signature against the public key in the certificate. This is what the browser
// extension does. We also show that an imposter and a replay both fail.
import { parseCertificate, signChallenge, verifyChallenge, generateSubjectKeyPair } from "../brain/sdk/dist/index.js";
import { heading, explain, kv, ok, bad, done, needState, fromHex } from "./lib.mjs";

heading(9, "Proof of possession (fresh-nonce challenge)");

const certPem = needState("certPem");
const sitePrivateKey = fromHex(needState("subjectPrivateKey"));
const parsed = parseCertificate(certPem);

explain(
  "The verifier picks a fresh random nonce and asks the site to sign it. Only the\n" +
  "holder of the private key can produce a signature that matches the public key\n" +
  "embedded in the certificate.",
);

// 1. Honest server: signs the fresh nonce with its real private key.
const nonce = crypto.getRandomValues(new Uint8Array(32));
kv("Fresh nonce", [...nonce].map((b) => b.toString(16).padStart(2, "0")).join(""));
const sig = signChallenge(sitePrivateKey, nonce);
const okReal = verifyChallenge(parsed.subjectPublicKey, nonce, sig.compact);
if (okReal) ok("Honest server: signature verifies against the cert's public key.");
else bad("Honest server failed -- something is wrong.");

// 2. Imposter: has the public cert but a DIFFERENT private key.
const imposter = generateSubjectKeyPair();
const forged = signChallenge(imposter.privateKey, nonce);
const okImposter = verifyChallenge(parsed.subjectPublicKey, nonce, forged.compact);
if (!okImposter) ok("Imposter (copied the cert, wrong key): REJECTED.");
else bad("Imposter accepted -- this must never happen.");

// 3. Replay: reuse the honest signature against a DIFFERENT nonce.
const newNonce = crypto.getRandomValues(new Uint8Array(32));
const okReplay = verifyChallenge(parsed.subjectPublicKey, newNonce, sig.compact);
if (!okReplay) ok("Replay (old signature, new nonce): REJECTED.");
else bad("Replay accepted -- this must never happen.");

explain(
  "\nBecause the nonce is fresh every time, copying the certificate is useless --\n" +
  "you also need the private key. That is the heart of client-side verification.",
);
done(9);
