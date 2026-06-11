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

It performs an **advisory** lookup: given the current tab's domain, it queries
the public Certz on-chain registry and tells you whether Certz has issued (and
not revoked) certificates for that domain. This is analogous to a Certificate
Transparency / DANE-style *signal*, layered beside normal HTTPS — never a
replacement for it.

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
