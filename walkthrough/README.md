# Certz walkthrough

A guided, hands-on tour of the **entire** Certz certificate lifecycle on Oasis
Sapphire. Each step is a small, heavily-commented script that does **one** thing
and explains it as it runs. Run them one at a time to understand the system, or
`npm run all` to watch the whole flow end to end.

## What you'll see

| Step | Idea | Touches the chain? |
|---|---|---|
| 1 | The CA's private key lives in the TEE (public key readable, private key unreadable) | read-only |
| 2 | You build the unsigned certificate (TBS) and its digest | local only |
| 3 | You request issuance and get a DNS-01 challenge | **sends a tx** |
| 4 | You prove domain ownership with a TXT record (real DNS lookup) | DNS only |
| 5 | The TEE signs your digest (dev stand-in for the ROFL oracle) | **sends a tx** |
| 6 | Splice the signature into a real X.509 certificate | local only |
| 7 | Verify the chain — with the SDK **and** OpenSSL | read-only |
| 8 | Check the public on-chain transparency registry | read-only |
| 9 | Proof of possession: a fresh-nonce challenge (imposter + replay rejected) | local only |

## Prerequisites

```bash
# 1. Build the SDK (the steps import from brain/sdk/dist)
cd ../brain/sdk && npm install && npm run build

# 2. Install this walkthrough's deps
cd ../../walkthrough && npm install
```

You also need a **funded Sapphire testnet key** for the two steps that send
transactions (3 and 5). Get test tokens at <https://faucet.testnet.oasis.io>.

## Run it

```bash
# the whole thing (recommended first run)
PRIVATE_KEY=<your-testnet-key> npm run all

# or one step at a time, to read each one
PRIVATE_KEY=<your-testnet-key> npm run step1
PRIVATE_KEY=<your-testnet-key> npm run step2
# ... etc
```

State (your keypair, the request id, the signature, the finished cert) is saved
between steps in `.state.json`, and the finished cert lands in `out/`. Both are
gitignored.

## The one honest caveat: DNS-01 on a domain you don't own

Step 4 does a **real** DNS lookup. If you use the default placeholder domain
(`demo.certz.example`), there's no real DNS record to find, so step 5 uses the
owner-only `devFulfill` to **simulate the oracle's "DNS verified" signal** — the
only simulated part of the flow. Everything else (TEE key, in-enclave signing,
on-chain registry, X.509, verification) is real.

To see **true** DNS-01 end to end, use a domain you control:

```bash
CERTZ_DOMAIN=yourdomain.com PRIVATE_KEY=<key> npm run step2
CERTZ_DOMAIN=yourdomain.com PRIVATE_KEY=<key> npm run step3
# publish the TXT record step 3/4 prints, wait for propagation, then:
CERTZ_DOMAIN=yourdomain.com npm run step4   # should now MATCH
# then run the ROFL oracle (brain/oracle) so a TEE — not devFulfill — fulfills.
```
