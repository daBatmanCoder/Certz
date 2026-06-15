# Why this extension can only do *soft* verification

A reasonable hope for Certz is: "install an extension and the browser will trust
Certz certificates / validate them against the blockchain." That is **not
possible**, and it is important to be honest about why before anyone invests
effort expecting it.

## What a Chrome (MV3) extension cannot do

1. **It cannot add a trust anchor.** There is no `chrome.*` API to insert a CA
   into the browser/OS trust store. (`chrome.certificateProvider` exists only on
   ChromeOS and only for *client* certificates, not server TLS roots.)
2. **It cannot intercept the TLS handshake.** Certificate validation happens in
   the network stack, below the extension layer. By the time `webRequest` /
   `declarativeNetRequest` see anything, TLS is already established (or already
   failed). Extensions can block or redirect requests; they cannot re-decide
   certificate trust.
3. **It cannot read the live wire certificate of the current page.** Extensions
   do not get the peer certificate chain that the TLS stack negotiated.

The consequence: an extension can **inform** and **warn**, but it cannot make
`https://example.com` validate against a Certz certificate, and it cannot turn a
browser's red "not secure" warning into a green lock.

## What this extension therefore does (honestly)

It performs **client-side, out-of-band verification** layered beside HTTPS. For
the current tab it:

1. **Fetches** the site's Certz certificate from `/.well-known/certz/certificate.pem`.
2. **Verifies the CA chain** — the certificate is signed by the pinned Certz CA
   root, is within its validity window, and its SAN matches the domain. (Full
   X.509/ECDSA verification, done in the popup via the bundled Certz SDK.)
3. **Checks the on-chain registry** — `sha256(TBSCertificate)` must be recorded
   and not revoked in the `CertRegistry` contract on Sapphire (`eth_call`).
4. **Proves possession** — it sends the site a *fresh random nonce*; the site
   signs it with its leaf private key; the extension verifies that signature
   against the public key inside the certificate (WebCrypto P-256). Because the
   nonce is fresh, this is **non-replayable**: copying the public certificate is
   not enough to pass.

This is a Certificate-Transparency / DANE-style *signal* plus a live
proof-of-possession — strictly stronger than a registry-count check, but still
**out of band**: it proves "this server controls a Certz-certified key, anchored
on-chain," not "the TLS connection itself used a Certz certificate."

### Why proof-of-possession, not "recover the key from the cert signature"

The certificate's signature is the *CA* signing the leaf; recovering a key from
it yields the CA key, not the site's. And a static certificate is replayable. The
only thing that proves the *live* server is authentic is a signature over a nonce
the verifier just chose — verified against the on-chain-anchored leaf key. P-256
public-key *recovery* is also non-standard and unsupported by WebCrypto, whereas
*verification* is native. So we verify a fresh challenge instead of recovering.

## What WOULD be required for hard validation

Hard, browser-native validation of blockchain-anchored certificates needs
changes the browser vendors control, not an extension:

- inclusion of a Certz/DANE-style validation path in the browser itself, or
- a local resolver/proxy (like the Handshake `hnsd` + DANE approach) that the OS
  routes through and that performs the validation before the browser sees the
  connection.

Both are large, ecosystem-level efforts. The extension here is deliberately
scoped to the only useful thing an extension can actually deliver: a truthful
advisory badge.
