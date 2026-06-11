# Certz DNS-01 Oracle

The oracle proves domain ownership and authorizes the confidential CA to sign.
It watches `ConfidentialCA` for `ChallengeRequested` events, resolves the TXT
record `_certz-challenge.<domain>`, and if it matches the on-chain challenge
nonce, calls the contract to issue the certificate.

## Why this is the trust-critical component

The CA private key lives inside the Sapphire TEE and will sign whatever
`fulfill()` tells it to. So `fulfill()` is gated by
`Subcall.roflEnsureAuthorizedOrigin(roflAppId)`: only an **attested ROFL TEE
instance** of this exact oracle (same measured container image) can trigger
signing. That is what makes "the DNS check actually happened" trustless rather
than "some server claims it happened".

## Local development (runnable now)

```bash
npm install
# owner key of the deployed ConfidentialCA (dev mode is owner-gated)
export PRIVATE_KEY=0x...
node oracle.mjs --mode dev --watch
```

`--mode dev` performs the **real DNS lookup** but issues via the owner-only
`devFulfill` path, because no ROFL app is registered yet. It is not trustless;
it exists so the full flow works before TEE deployment.

To make a request succeed locally, publish the challenge from `certz issue` (or
the website) as a DNS TXT record at `_certz-challenge.<domain>`, then let the
oracle pass run.

## Production (Oasis ROFL TEE)

Requires the [Oasis CLI](https://docs.oasis.io/general/manage-tokens/cli/), a
funded account, and access to ROFL nodes. Honest status: this repo provides the
oracle daemon + container scaffolding; registering and deploying the ROFL app is
an operational step we have not executed here.

```bash
oasis rofl init        # generates rofl.yaml (see rofl.yaml.template)
oasis rofl create      # registers the app -> app id (bytes21)
oasis rofl build       # measures compose.yaml into the enclave identity
oasis rofl deploy      # schedules onto ROFL TEE nodes
```

Then bind the app id on-chain (owner-only):

```solidity
ConfidentialCA.setRoflAppId(<appId from `oasis rofl create`>);
```

From that point, `fulfill()` only accepts attested instances of this oracle, and
`devFulfill`/`devMode` should be disabled (`setDevMode(false)`).

## Files

- `oracle.mjs` — the daemon (DNS check + fulfill/devFulfill).
- `Dockerfile`, `compose.yaml` — the measured TEE workload.
- `rofl.yaml.template` — annotated manifest reference.
