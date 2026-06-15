# Certz — How It Works

**Certz is a certificate authority (like Let's Encrypt) whose signing key lives inside
a blockchain's secure hardware (a TEE on Oasis Sapphire) instead of a company's server,
and every certificate it issues is logged on a public, auditable blockchain.**

Trust moves from *"a company and its servers"* to *"tamper-proof hardware + a public ledger."*

---

## 1. The big picture

```mermaid
flowchart LR
    subgraph User["You / your website"]
        W["Website + leaf keypair<br/>(you generate this)"]
        DNS["Your DNS zone<br/>_certz-challenge.&lt;domain&gt; TXT"]
    end

    subgraph Sapphire["Oasis Sapphire (confidential blockchain)"]
        CA["ConfidentialCA<br/>CA private key lives in TEE<br/>— never readable"]
        REG["CertRegistry<br/>public log of issued certs<br/>(Certificate-Transparency style)"]
    end

    Oracle["DNS checker<br/>(dev: your server / prod: ROFL TEE)"]

    subgraph Visitor["A visitor"]
        EXT["Chrome extension<br/>(advisory verifier)"]
    end

    W -->|"1 requestCertificate(domain, tbsHash)"| CA
    CA -->|"2 random challenge nonce"| W
    W -->|"3 publish nonce"| DNS
    Oracle -->|"4 reads request + checks DNS"| DNS
    Oracle -->|"5 fulfill() — authorize signing"| CA
    CA -->|"6 signs cert + records issuance"| REG
    W -->|"7 serve cert + sign nonces"| EXT
    EXT -->|"check cert signature, on-chain record, live key"| Sapphire
```

---

## 2. Issuance — getting a certificate

```mermaid
sequenceDiagram
    participant W as Website (you)
    participant CA as ConfidentialCA (Sapphire TEE)
    participant D as Your DNS
    participant O as DNS checker (server / ROFL)
    participant R as CertRegistry (public)

    W->>W: generate leaf keypair (pub + priv)
    W->>W: build cert body (TBS) embedding leaf PUBLIC key
    W->>CA: requestCertificate(domain, SHA256(TBS), notAfter)
    CA->>CA: generate random challenge nonce (in TEE)
    CA-->>W: requestId + challenge nonce
    W->>D: publish TXT _certz-challenge.<domain> = nonce
    O->>CA: read pending request + its challenge
    O->>D: look up the TXT record
    D-->>O: nonce (proves domain control)
    O->>CA: fulfill(requestId)   %% only an authorized checker may call this
    CA->>CA: sign the TBS digest with the CA key (in TEE)
    CA->>R: record(SHA256(TBS), domain, notAfter)
    W->>CA: getSignature(requestId)
    CA-->>W: CA's signature
    W->>W: assemble X.509 = TBS + CA signature
```

**Key facts people get wrong:**
- The **leaf private key is yours** and is *never* sent to the CA. Only the **public** key goes into the cert.
- The CA signs the **cert body (TBS)**, not anything you signed. That CA signature *is* the authority.
- The blockchain stores a **fingerprint** (SHA-256 of the cert body) + domain + expiry — **not** the DNS record and **not** the full cert.

---

## 3. Verification — what the extension checks

```mermaid
sequenceDiagram
    participant E as Chrome extension
    participant S as The website
    participant B as Sapphire (CertRegistry)

    E->>S: GET /.well-known/certz/certificate.pem
    S-->>E: the certificate
    E->>E: 1. signed by Certz CA root? SAN matches domain? in date?
    E->>B: 2. registry.isValid( SHA256(cert body) )?
    B-->>E: recorded + not revoked + unexpired?
    E->>S: 3. GET /sign?nonce=<fresh random>
    S->>S: sign nonce with leaf PRIVATE key
    S-->>E: signature
    E->>E: verify signature against leaf PUBLIC key in cert
    Note over E: all 3 green → "Certz verified"
```

| Check | Proves | Verified against |
|---|---|---|
| CA signature on the cert | the Certz authority issued it | the CA's pinned public key |
| On-chain registry record | it was really issued & not revoked | the public CertRegistry |
| Fresh-nonce signature | the site holds the key **right now** | the leaf public key in the cert |

The fresh nonce is what stops replay: a copied cert is public, but only the real key-holder can sign a random value that didn't exist a second ago.

---

## 4. Why we need ROFL (the one trust gap left)

The question is **not** "how do *you* prove you own the domain?" — you do that by publishing the
DNS record. The question is: **who tells the CA the DNS record is really there, and why should
anyone believe them?**

```mermaid
flowchart TB
    subgraph Dev["TODAY (dev mode) — trust the operator"]
        D1["Our own server checks DNS"]
        D2["calls devFulfill() with the OWNER key"]
        D3["CA signs"]
        D1 --> D2 --> D3
        DX["⚠ The operator could LIE:<br/>call devFulfill without any real DNS check<br/>and mint a cert for a domain they don't own"]
    end

    subgraph Prod["GOAL (ROFL) — trust the hardware"]
        P1["DNS check runs INSIDE an attested TEE oracle"]
        P2["calls fulfill() through an attested channel"]
        P3["contract verifies the caller is the genuine ROFL app<br/>(roflEnsureAuthorizedOrigin)"]
        P4["CA signs"]
        P1 --> P2 --> P3 --> P4
        PX["✓ Nobody — not even us — can forge<br/>'DNS passed'. The check is tamper-proof code."]
    end
```

**In one sentence:** ROFL isn't about *your* dashboard access — it's about making the
"the DNS record exists" claim come from **tamper-proof hardware running known code**, so the
CA operator can't secretly issue certs without a real ownership check. Until ROFL is wired in,
domain validation is *self-asserted by the operator* — which is fine for a demo, but it's the
gap between "trust me" and "trust the math."

---

## 5. Honest limitations

- **Advisory, not native.** Browsers don't trust Certz; this rides *beside* HTTPS via an
  extension. It can say "verified" but can't change what Chrome's TLS stack trusts.
- **Domain validation isn't trustless yet** (see §4 — needs ROFL).
- **Proof of possession is deferred.** Classic ACME makes you self-sign a CSR at request time;
  Certz instead proves possession later via the nonce challenge.
