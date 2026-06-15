// STEP 4 -- Prove domain ownership via DNS (DNS-01).
//
// This is the step most people have never seen up close. To prove you own a
// domain, you publish a specific TXT record. A verifier then does a normal DNS
// lookup; if the expected value is there, only the domain's controller could
// have put it there. This script shows you the exact record AND does a REAL DNS
// query so you can watch it succeed or fail.
import { heading, explain, kv, ok, warn, done, needState, resolveChallengeTxt, txtMatchesChallenge } from "./lib.mjs";

heading(4, "DNS-01 ownership challenge (real DNS lookup)");

const domain = needState("domain");
const challenge = needState("challenge");
const recordName = `_certz-challenge.${domain}`;

explain(
  "To prove control of the domain, publish this TXT record with your DNS host\n" +
  "(Cloudflare, Route53, Namecheap, etc.):",
);
kv("Record name", recordName);
kv("Record type", "TXT");
kv("Record value", challenge);

console.log("\n  Now doing a real DNS TXT lookup (system + public resolvers)...\n");

const isReal = !/\.(example|invalid|localhost|test)$/.test(domain) && !domain.includes("certz.example");

const flat = await resolveChallengeTxt(domain);
if (flat.length > 0) {
  kv("TXT found", JSON.stringify(flat));
  if (txtMatchesChallenge(flat, challenge)) {
    ok("The published TXT record MATCHES the challenge. Ownership proven!");
  } else {
    warn("A TXT record exists but does not match the challenge yet.");
  }
} else if (isReal) {
  warn("No matching TXT record visible from any resolver yet.");
  warn("Publish the record above, wait for DNS to propagate, then re-run step 4.");
} else {
  explain(
    `The domain "${domain}" is a demo/placeholder you don't actually own, so a\n` +
    "real DNS record can't exist. That's expected. In step 5 we use the\n" +
    "owner-only devFulfill path to SIMULATE the oracle's 'DNS verified' signal --\n" +
    "this is the ONLY simulated part of the whole flow.\n\n" +
    "To see real DNS-01 end to end, set CERTZ_DOMAIN to a domain you control\n" +
    "and publish the TXT record above before running step 5 with the oracle.",
  );
}

done(4);
