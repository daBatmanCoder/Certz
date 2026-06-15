"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import {
  getCertzClient,
  isMockBackend,
  type DnsChallenge,
  type IssuedCertificate,
} from "@/lib/certz";
import { Badge, Button } from "@/components/ui";
import { CopyButton, DownloadButton } from "@/components/copy-button";
import { RegistryRecordCard } from "@/components/registry-record-card";
import { isDemoPlaceholderDomain } from "@/lib/certz/deployment";
import { cn } from "@/lib/utils";

type StepId = 1 | 2 | 3 | 4;

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: "Domain" },
  { id: 2, label: "DNS-01 challenge" },
  { id: 3, label: "Check & issue" },
  { id: 4, label: "Certificate" },
];

export function CreateWizard() {
  const client = useMemo(() => getCertzClient(), []);
  const mock = isMockBackend(client);
  const [step, setStep] = useState<StepId>(1);
  const [domain, setDomain] = useState("");
  const [challenge, setChallenge] = useState<DnsChallenge | null>(null);
  const [issued, setIssued] = useState<IssuedCertificate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestChallenge(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ch = await client.requestChallenge(domain);
      setChallenge(ch);
      setDomain(ch.domain);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function checkAndIssue() {
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      const result = await client.checkAndIssue(challenge.challengeId);
      setIssued(result);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Issuance failed.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setDomain("");
    setChallenge(null);
    setIssued(null);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-10">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Create a certificate
          </h1>
          <Badge tone={mock ? "accent" : "ok"}>
            {mock ? "mock client" : "Sapphire testnet"}
          </Badge>
        </div>
        <p className="max-w-2xl text-muted">
          Prove control of a domain with a DNS-01 challenge and receive an X.509
          certificate signed by the confidential CA, anchored in the on-chain
          registry.{" "}
          {mock
            ? "This wizard runs against a local simulation of the Certz data-layer."
            : "Your keypair is generated in your browser and the certificate is signed by the real CA key inside the Sapphire TEE."}
        </p>
      </header>

      <Stepper current={step} />

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-8">
        {step === 1 ? (
          <StepDomain
            domain={domain}
            setDomain={setDomain}
            busy={busy}
            onSubmit={requestChallenge}
          />
        ) : null}

        {step === 2 && challenge ? (
          <StepChallenge
            challenge={challenge}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        ) : null}

        {step === 3 && challenge ? (
          <StepIssue
            challenge={challenge}
            busy={busy}
            onBack={() => setStep(2)}
            onIssue={checkAndIssue}
          />
        ) : null}

        {step === 4 && issued ? (
          <StepResult issued={issued} onReset={reset} />
        ) : null}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: StepId }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 sm:gap-3">
      {STEPS.map((s, i) => {
        const state =
          s.id < current ? "done" : s.id === current ? "active" : "todo";
        return (
          <li key={s.id} className="flex items-center gap-2 sm:gap-3">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs transition-colors",
                state === "active" &&
                  "border-accent/60 bg-accent/10 text-accent-strong",
                state === "done" && "border-border-strong text-muted-strong",
                state === "todo" && "border-border text-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                  state === "active"
                    ? "bg-accent text-[#0b0712]"
                    : "bg-surface-2 text-muted",
                )}
              >
                {s.id}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 ? (
              <span className="h-px w-4 bg-border sm:w-6" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
      {children}
    </label>
  );
}

function StepDomain({
  domain,
  setDomain,
  busy,
  onSubmit,
}: {
  domain: string;
  setDomain: (v: string) => void;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface/40 p-6">
      <h2 className="font-display text-lg font-medium">Step 1 — Enter a domain</h2>
      <p className="mt-2 text-sm text-muted">
        The domain you want a certificate for. You will prove control of it in
        the next step.
      </p>
      <div className="mt-6">
        <FieldLabel>Domain</FieldLabel>
        <input
          autoFocus
          type="text"
          inputMode="url"
          placeholder="example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="w-full rounded-lg border border-border-strong bg-background px-4 py-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <div className="mt-6 flex items-center justify-end">
        <Button type="submit" disabled={busy || domain.trim().length === 0}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Requesting…
            </>
          ) : (
            <>
              Request challenge
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function StepChallenge({
  challenge,
  onBack,
  onContinue,
}: {
  challenge: DnsChallenge;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-6">
      <h2 className="font-display text-lg font-medium">
        Step 2 — Publish the DNS-01 challenge
      </h2>
      <p className="mt-2 text-sm text-muted">
        Create the following TXT record with your DNS provider. A TEE oracle
        resolves it to confirm you control{" "}
        <span className="font-mono text-foreground">{challenge.domain}</span>.
      </p>

      {isDemoPlaceholderDomain(challenge.domain) ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200/90">
          <span className="font-medium">Demo domain.</span>{" "}
          <span className="font-mono text-foreground">{challenge.domain}</span>{" "}
          is a placeholder you don&apos;t own, so there&apos;s no real DNS to
          check — issuance will use the owner-only dev path (DNS ownership
          simulated). Use a domain you control to enforce real DNS-01.
        </p>
      ) : (
        <p className="mt-3 rounded-lg border border-border bg-background-soft p-3 text-xs leading-relaxed text-muted">
          Real domain detected: the server will verify this exact TXT record by a
          live DNS lookup before the CA will sign. Publish it first.
        </p>
      )}

      <div className="mt-6 space-y-px overflow-hidden rounded-lg border border-border-strong">
        <ChallengeRow label="Type" value={challenge.recordType} />
        <ChallengeRow label="Name" value={challenge.recordName} copyable />
        <ChallengeRow label="Value" value={challenge.token} copyable />
      </div>

      <div className="mt-4 rounded-lg border border-border bg-background-soft p-4">
        <FieldLabel>Example (BIND zone syntax)</FieldLabel>
        <pre className="scroll-thin overflow-x-auto font-mono text-xs leading-relaxed text-muted-strong">
{`${challenge.recordName}. IN TXT "${challenge.token}"`}
        </pre>
      </div>

      <p className="mt-4 text-xs text-muted">
        DNS changes can take a few minutes to propagate. Once the record is live,
        continue.
      </p>

      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onContinue}>
          I&apos;ve published it
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ChallengeRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-background px-4 py-3">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {label}
        </div>
        <div className="mt-1 break-all font-mono text-sm text-foreground">
          {value}
        </div>
      </div>
      {copyable ? <CopyButton value={value} /> : null}
    </div>
  );
}

function StepIssue({
  challenge,
  busy,
  onBack,
  onIssue,
}: {
  challenge: DnsChallenge;
  busy: boolean;
  onBack: () => void;
  onIssue: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-6">
      <h2 className="font-display text-lg font-medium">
        Step 3 — Check & issue
      </h2>
      <p className="mt-2 text-sm text-muted">
        Certz will ask the ROFL TEE oracle to verify the TXT record for{" "}
        <span className="font-mono text-foreground">{challenge.domain}</span>. If
        ownership checks out, the confidential CA signs the certificate inside
        the enclave and records it on-chain.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-background-soft p-4 font-mono text-xs text-muted">
        <div>
          challenge_id: <span className="text-foreground">{challenge.challengeId}</span>
        </div>
        <div className="mt-1">
          target: <span className="text-foreground">{challenge.recordName}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="button" onClick={onIssue} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying & signing…
            </>
          ) : (
            <>
              Check &amp; issue
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function StepResult({
  issued,
  onReset,
}: {
  issued: IssuedCertificate;
  onReset: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-medium text-foreground">
              Certificate issued
            </h2>
            <p className="mt-1 text-sm text-muted">
              Signed by the confidential CA for{" "}
              <span className="font-mono text-foreground">{issued.domain}</span>.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Badge tone="ok">issued</Badge>
            {issued.dnsVerified ? (
              <Badge tone="ok">DNS-01 verified</Badge>
            ) : issued.demo ? (
              <Badge tone="accent">DNS simulated (demo)</Badge>
            ) : null}
          </div>
        </div>

        {issued.txHash ? (
          <p className="mt-3 break-all font-mono text-[11px] text-muted">
            issuance tx:{" "}
            <a
              href={`https://explorer.oasis.io/testnet/sapphire/tx/${issued.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent-strong hover:underline"
            >
              {issued.txHash}
            </a>
          </p>
        ) : null}

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel>Certificate (PEM)</FieldLabel>
            <div className="flex gap-2">
              <CopyButton value={issued.pem} label="Copy PEM" />
              <DownloadButton
                value={issued.pem}
                filename={`${issued.domain}.pem`}
                label="Download"
              />
            </div>
          </div>
          <pre className="scroll-thin max-h-72 overflow-auto rounded-lg border border-border-strong bg-background p-4 font-mono text-xs leading-relaxed text-muted-strong">
{issued.pem}
          </pre>
        </div>

        {issued.privateKeyPem ? (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <FieldLabel>Private key — keep secret</FieldLabel>
              <div className="flex gap-2">
                <CopyButton value={issued.privateKeyPem} label="Copy key" />
                <DownloadButton
                  value={issued.privateKeyPem}
                  filename={`${issued.domain}.key.pem`}
                  label="Download"
                />
              </div>
            </div>
            <p className="mb-2 text-xs leading-relaxed text-amber-200/80">
              Generated in your browser and never sent to the server. You need it
              to prove possession (the extension&apos;s live challenge). Store it
              securely — anyone with this key can impersonate the certificate.
            </p>
            <pre className="scroll-thin max-h-40 overflow-auto rounded-lg border border-amber-500/30 bg-background p-4 font-mono text-xs leading-relaxed text-muted-strong">
{issued.privateKeyPem}
            </pre>
          </div>
        ) : null}
      </div>

      <RegistryRecordCard record={issued.record} />

      <div className="flex items-center justify-between">
        <a
          href="/verify"
          className="font-mono text-sm text-accent-strong hover:underline"
        >
          Verify this certificate →
        </a>
        <Button type="button" variant="secondary" onClick={onReset}>
          <RotateCcw className="h-4 w-4" />
          New certificate
        </Button>
      </div>
    </div>
  );
}
