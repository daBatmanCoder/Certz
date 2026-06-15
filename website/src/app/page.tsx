import {
  ShieldCheck,
  KeyRound,
  Globe2,
  ScrollText,
  SearchCheck,
  Layers,
  ArrowRight,
  CircleSlash,
  Eye,
  Lock,
} from "lucide-react";
import { Badge, ButtonLink, Card, Container, SectionHeading } from "@/components/ui";
import { NodeNetwork } from "@/components/node-network";
import { FlowDiagram } from "@/components/flow-diagram";

const capabilities = [
  {
    icon: KeyRound,
    title: "TEE-held CA key",
    body: "The CA private key is generated inside an Oasis Sapphire confidential contract and never leaves the TEE. No operator, admin, or host ever sees it.",
  },
  {
    icon: Globe2,
    title: "ACME-style DNS-01 proof",
    body: "Domain control is proven by publishing a TXT record at _certz-challenge.<domain> — the same ownership model ACME clients already use.",
  },
  {
    icon: ScrollText,
    title: "Public transparency log",
    body: "Every issuance is anchored on-chain: domain → certificate digest, with status and revocation. Auditable by anyone, Certificate-Transparency style.",
  },
  {
    icon: SearchCheck,
    title: "Out-of-band verifier",
    body: "A verifier checks a presented certificate against the on-chain CA root and registry — a DANE-like layer on top of normal HTTPS.",
  },
  {
    icon: Layers,
    title: "Built on Oasis Sapphire",
    body: "A confidential, TEE-backed EVM chain. Signing stays private; the audit trail stays public. Both properties from one platform.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0">
          <NodeNetwork className="h-full w-full opacity-70" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />

        <Container className="relative py-24 sm:py-32 lg:py-40">
          <div className="max-w-3xl">
            <Badge tone="accent" className="mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Oasis Sapphire · testnet proof of concept
            </Badge>

            <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              certz
            </h1>
            <p className="mt-6 text-balance font-display text-xl text-foreground sm:text-2xl">
              A confidential, on-chain certificate authority.
            </p>
            <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-muted">
              Certz issues real X.509 certificates signed by a CA key that lives
              only inside a TEE. Ownership is proven with DNS-01, verified in an
              Oasis ROFL enclave, and every issuance is anchored in a public,
              auditable on-chain registry.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <ButtonLink href="/create" variant="primary" size="md">
                Create a certificate
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/verify" variant="secondary" size="md">
                Verify a certificate
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      {/* ── What it is ───────────────────────────────────────── */}
      <section className="py-24">
        <Container>
          <SectionHeading
            eyebrow="What it is"
            title="A certificate authority whose private key no one can read."
            description="Confidential signing and public transparency, combined. Five properties define Certz."
          />

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((cap) => (
              <Card key={cap.title} className="group">
                <cap.icon className="h-6 w-6 text-accent-strong transition-transform duration-200 group-hover:-translate-y-0.5" />
                <h3 className="mt-5 font-display text-lg font-medium text-foreground">
                  {cap.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">
                  {cap.body}
                </p>
              </Card>
            ))}
            <Card className="flex flex-col justify-center border-dashed bg-transparent">
              <p className="font-mono text-sm leading-relaxed text-muted-strong">
                The result: a CA you can <span className="text-accent-strong">audit</span>{" "}
                but cannot <span className="text-accent-strong">impersonate</span>.
              </p>
            </Card>
          </div>
        </Container>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="border-y border-border bg-background-soft py-24">
        <Container>
          <SectionHeading
            eyebrow="How it works"
            title="Request, prove, sign, anchor, verify."
            description="A single issuance walks through six steps. The signing key never leaves the enclave at any point."
          />
          <div className="mt-14">
            <FlowDiagram />
          </div>
        </Container>
      </section>

      {/* ── Why on-chain / Sapphire ──────────────────────────── */}
      <section className="py-24">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <SectionHeading
              eyebrow="Why on-chain · why Sapphire"
              title="Two properties that normally fight each other, on one chain."
              description="Traditional CAs ask you to trust that an operator protects the signing key and runs an honest log. Certz removes the operator from both."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <Lock className="h-5 w-5 text-accent-strong" />
                <h3 className="mt-4 font-display text-base font-medium">
                  Confidential signing
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Sapphire runs the CA contract inside a TEE. The key is born
                  there, used there, and never exported — not even to the node
                  operator.
                </p>
              </Card>
              <Card>
                <Eye className="h-5 w-5 text-accent-strong" />
                <h3 className="mt-4 font-display text-base font-medium">
                  Public transparency
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  The registry contract is plain on-chain state. Anyone can
                  enumerate issuances, confirm a digest, or watch for
                  mis-issuance — no privileged access required.
                </p>
              </Card>
            </div>
          </div>
        </Container>
      </section>

      {/* ── What Certz is NOT (honesty) ──────────────────────── */}
      <section className="border-t border-border py-24">
        <Container>
          <SectionHeading
            eyebrow="Straight talk"
            title="What Certz is not."
            description="An honest CA has to be honest about its limits, too."
          />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            <NotCard
              icon={ShieldCheck}
              title="Not trusted by browsers"
              body="Certz certificates are not in any browser root program. Mainstream TLS trust requires audited inclusion in Mozilla/Apple/Microsoft/Chrome stores — out of scope here. Browsers will not show a green lock for a Certz cert."
            />
            <NotCard
              icon={Eye}
              title="Extension is soft-verify only"
              body="A future browser extension can only do advisory verification — a badge or warning. Chrome exposes no API to override TLS validation, so it can never replace the browser's own trust decision."
            />
            <NotCard
              icon={CircleSlash}
              title="A testnet research demo"
              body="This is a working proof of concept on Oasis Sapphire testnet, not a production CA. The site currently runs against a local mock of the data-layer while the contracts are finalised."
            />
          </div>
        </Container>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────── */}
      <section className="pb-12">
        <Container>
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/40 px-8 py-14 text-center sm:py-16">
            <div className="pointer-events-none absolute inset-0 opacity-40">
              <NodeNetwork className="h-full w-full" />
            </div>
            <div className="relative mx-auto max-w-xl">
              <h2 className="font-display text-2xl font-medium sm:text-3xl">
                Issue a certificate in the open.
              </h2>
              <p className="mt-4 text-balance text-muted">
                Run the full flow against the mock client — prove a domain, get a
                PEM, and see the on-chain registry record it produces.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink href="/create" variant="primary">
                  Create a certificate
                  <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <ButtonLink href="/verify" variant="secondary">
                  Verify a certificate
                </ButtonLink>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function NotCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-6">
      <Icon className="h-5 w-5 text-amber-300/90" />
      <h3 className="mt-4 font-display text-base font-medium text-foreground">
        {title}
      </h3>
      <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
