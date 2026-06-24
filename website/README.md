# Certz — website

The marketing + app frontend for **Certz**, a confidential, on-chain certificate
authority built on [Oasis Sapphire](https://docs.oasis.io).

Certz issues real X.509 TLS certificates signed by a CA private key that is
generated and lives **only inside a Sapphire confidential smart contract (a
TEE)**. Domain ownership is proven with an ACME-style DNS-01 challenge, verified
inside an Oasis ROFL TEE oracle, and every issuance is anchored in a public,
auditable on-chain transparency registry.

> **Honest scope.** Certz certificates are **not** trusted by web browsers
> (browser trust requires audited inclusion in root programs — out of scope). A
> future browser extension could only offer **soft, advisory** verification.
> This is a research **proof of concept on Sapphire testnet**.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS v4 (CSS-based theme in `src/app/globals.css`)
- [lucide-react](https://lucide.dev) for icons
- Canvas-based node-network hero (no animation library)

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
```

## Pages

| Route     | What it does                                                              |
| --------- | ------------------------------------------------------------------------- |
| `/`       | Landing page: hero, capabilities, how-it-works flow, why Sapphire, honesty section. |
| `/create` | Issuance wizard: domain → DNS-01 challenge → check & issue → PEM + on-chain record. |
| `/verify` | Out-of-band verifier: paste a PEM + domain, get a checklist of pass/fail checks. |
| `/docs`   | Lightweight concept reference (stub).                                     |

## Real backend (default)

By **default the site runs against the real Certz deployment on Sapphire
testnet** — real on-chain transactions, real TEE signing, real X.509, real
DNS-01 for domains you control. The in-browser mock is still available for
offline UI work behind `NEXT_PUBLIC_CERTZ_BACKEND=mock`.

The data-layer lives in `src/lib/certz/`:

- `types.ts` — shared domain types (challenges, registry records, verification results).
- `client.ts` — the `CertzClient` interface that all backends implement.
- `sapphireClient.ts` — **`SapphireCertzClient`** (default). Generates the site
  keypair and does all cryptography **in the browser** via `@certz/sdk` (TBS
  build, certificate finalize, X.509 chain verification). On-chain ops go through
  the `/api` routes.
- `deployment.ts` — public addresses, RPC, and the pinned CA root (trust anchor).
- `server.ts` — server-only ethers helpers (holds the signing key).
- `mockClient.ts` — `MockCertzClient`: in-browser simulation, no chain.
- `index.ts` — `getCertzClient()` selects the backend (Sapphire unless the env
  flag forces mock).

### API routes (server-side, hold the signing key)

| Route | What it does |
| --- | --- |
| `POST /api/challenge` | sends the real `requestCertificate` tx, returns the DNS-01 challenge |
| `POST /api/issue` | checks DNS-01 (real domains) then `devFulfill` → TEE signs → returns the DER signature |
| `GET /api/registry` | read-only transparency-registry lookups (by digest or domain) |

### Configuration

Copy `.env.example` to `.env.local` and set `CERTZ_SIGNER_KEY` to a funded
Sapphire testnet key that **owns** the deployed `ConfidentialCA` (it pays gas and
may `devFulfill`). The browser never sees this key.

> Honesty: the on-chain authorization uses the owner-only `devFulfill` because
> production `fulfill()` is gated to an attested ROFL TEE oracle (not deployed
> here). For domains you actually control, `/api/issue` still enforces a **real
> DNS-01 TXT lookup** before signing; placeholder demo domains skip it and are
> labeled as such in the UI.

## Notes

- The hero/CTA graphics use a small `<canvas>` network animation that respects
  `prefers-reduced-motion`.
- The Tailwind theme (colors, fonts) is defined via CSS variables and
  `@theme` in `src/app/globals.css` (Tailwind v4 convention — there is no
  `tailwind.config.js`).

<!-- redeploy trigger: pick up CERTZ_SIGNER_KEY env on Vercel -->
