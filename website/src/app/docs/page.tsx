import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Badge, ButtonLink, Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Documentation for Certz — a confidential, on-chain certificate authority on Oasis Sapphire.",
};

const concepts = [
  {
    term: "Confidential CA key",
    def: "The CA private key is generated inside an Oasis Sapphire confidential contract (a TEE) and is never exported. Signing happens inside the enclave.",
  },
  {
    term: "DNS-01 challenge",
    def: "Ownership is proven by publishing a TXT record at _certz-challenge.<domain>, mirroring the ACME DNS-01 method.",
  },
  {
    term: "ROFL TEE oracle",
    def: "An Oasis ROFL enclave resolves the DNS challenge off-chain and attests the result, authorising the on-chain CA to sign.",
  },
  {
    term: "Transparency registry",
    def: "A public on-chain contract mapping domain → certificate digest, with validity and revocation status. Certificate-Transparency style.",
  },
  {
    term: "Out-of-band verifier",
    def: "Checks a presented certificate against the CA root and registry. A DANE-like layer alongside normal HTTPS, not a replacement for it.",
  },
];

export default function DocsPage() {
  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Docs
          </h1>
          <Badge>work in progress</Badge>
        </div>
        <p className="max-w-2xl text-muted">
          A short orientation while full documentation is written. Certz is a
          research proof of concept on Oasis Sapphire testnet — the web app
          currently runs against a local mock of the data-layer.
        </p>

        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-strong">
            Core concepts
          </h2>
          <dl className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {concepts.map((c) => (
              <div
                key={c.term}
                className="grid gap-1 bg-surface/30 p-5 sm:grid-cols-[200px_1fr] sm:gap-6"
              >
                <dt className="font-mono text-sm text-foreground">{c.term}</dt>
                <dd className="text-sm leading-relaxed text-muted">{c.def}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-strong">
            Try it
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/create" variant="primary">
              Create a certificate
            </ButtonLink>
            <ButtonLink href="/verify" variant="secondary">
              Verify a certificate
            </ButtonLink>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-strong">
            References
          </h2>
          <ul className="mt-6 space-y-3">
            <li>
              <a
                href="https://github.com/daBatmanCoder/Certz"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono text-sm text-muted-strong transition-colors hover:text-accent-strong"
              >
                Certz source on GitHub
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </li>
            <li>
              <a
                href="https://docs.oasis.io"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono text-sm text-muted-strong transition-colors hover:text-accent-strong"
              >
                Oasis Sapphire documentation
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </li>
          </ul>
        </section>

        <div className="mt-14 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-5">
          <p className="text-sm leading-relaxed text-muted">
            <span className="font-medium text-amber-200">Honest scope:</span>{" "}
            Certz certificates are not trusted by web browsers and a future
            extension can only offer soft, advisory verification. See the
            landing page&apos;s &ldquo;What Certz is not&rdquo; section for the
            full caveats.
          </p>
        </div>
      </div>
    </Container>
  );
}
