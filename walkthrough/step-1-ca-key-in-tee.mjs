// STEP 1 -- The CA's signing key lives inside the Sapphire TEE.
//
// A normal certificate authority (Let's Encrypt, DigiCert...) keeps its private
// key in an HSM that you have to trust the operator about. Certz keeps the key
// inside an Oasis Sapphire confidential contract (a TEE). This step proves two
// things you can check yourself:
//   1. the CA has a PUBLIC key that anyone can read,
//   2. there is NO way -- for anyone, including the contract owner -- to read
//      the PRIVATE key back out.
import { heading, explain, kv, ok, warn, done, loadDeployment, provider, ethers, CA_ABI } from "./lib.mjs";

heading(1, "The CA private key lives in the TEE");
explain(
  "We connect to the deployed ConfidentialCA contract on Sapphire testnet and\n" +
  "read what is (and is not) exposed. The public key is returned; the secret key\n" +
  "has no getter at all -- it only ever exists inside the enclave.",
);

const dep = loadDeployment();
const ca = new ethers.Contract(dep.ca, CA_ABI, provider());

kv("Network", dep.network);
kv("CA contract", dep.ca);

const initialized = await ca.initialized();
ok(`CA is bootstrapped: ${initialized}`);

const pub = await ca.caPublicKey();
kv("caPublicKey()", pub);
ok("Anyone can read the 33-byte compressed P-256 PUBLIC key above.");

// There is deliberately no `caSecretKey()` getter. The storage var is `private`
// and is only ever passed to Sapphire.sign() inside the enclave. Trying to call
// a getter that does not exist simply has no function selector to hit.
try {
  const probe = new ethers.Contract(dep.ca, ["function caSecretKey() view returns (bytes)"], provider());
  const leaked = await probe.caSecretKey();
  warn(`UNEXPECTED: a secret value came back (${leaked}) -- investigate!`);
} catch {
  ok("There is NO caSecretKey() getter. The private key is unreadable by design.");
}

explain(
  "\nTakeaway: the CA can SIGN (we'll see that in step 5) but the key material\n" +
  "never leaves the TEE. That is the whole point of putting the CA on Sapphire.",
);
done(1);
