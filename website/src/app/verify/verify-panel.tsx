"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, ShieldCheck, TriangleAlert, X } from "lucide-react";
import {
  getCertzClient,
  isMockBackend,
  type VerificationCheck,
  type VerificationResult,
} from "@/lib/certz";
import { Badge, Button } from "@/components/ui";
import { RegistryRecordCard } from "@/components/registry-record-card";
import { cn } from "@/lib/utils";

export function VerifyPanel() {
  const client = useMemo(() => getCertzClient(), []);
  const mock = isMockBackend(client);
  const [pem, setPem] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const canSubmit = pem.trim().length > 0 && domain.trim().length > 0 && !busy;

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    setResult(null);
    try {
      const res = await client.verifyCertificate(pem, domain);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-10">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Verify a certificate
          </h1>
          <Badge tone={mock ? "accent" : "ok"}>
            {mock ? "mock client" : "Sapphire testnet"}
          </Badge>
        </div>
        <p className="max-w-2xl text-muted">
          Paste a certificate and the domain it claims to cover. Certz checks it
          out-of-band against the CA root and the on-chain transparency
          registry — a DANE-like layer on top of normal HTTPS, not a browser
          trust decision.
        </p>
      </header>

      <form
        onSubmit={onVerify}
        className="rounded-xl border border-border bg-surface/40 p-6"
      >
        <div className="mb-4">
          <label className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Certificate (PEM)
          </label>
          <textarea
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            rows={9}
            spellCheck={false}
            placeholder={"-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"}
            className="scroll-thin w-full resize-y rounded-lg border border-border-strong bg-background px-4 py-3 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted/50 focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="mb-6">
          <label className="mb-2 block font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Domain
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="w-full rounded-lg border border-border-strong bg-background px-4 py-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">
            Tip: issue one on{" "}
            <a href="/create" className="text-accent-strong hover:underline">
              Create
            </a>{" "}
            first, then paste it here.
          </p>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                Verify
              </>
            )}
          </Button>
        </div>
      </form>

      {error ? (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? <VerificationReport result={result} /> : null}
    </div>
  );
}

function VerificationReport({ result }: { result: VerificationResult }) {
  return (
    <div className="mt-8 space-y-6">
      <div
        className={cn(
          "flex items-center justify-between gap-4 rounded-xl border p-5",
          result.ok
            ? "border-emerald-500/40 bg-emerald-500/[0.05]"
            : "border-red-500/40 bg-red-500/[0.05]",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              result.ok
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-red-500/15 text-red-300",
            )}
          >
            {result.ok ? (
              <Check className="h-5 w-5" />
            ) : (
              <X className="h-5 w-5" />
            )}
          </span>
          <div>
            <div className="font-display text-base font-medium text-foreground">
              {result.ok
                ? "Verified by Certz"
                : "Verification failed"}
            </div>
            <div className="font-mono text-xs text-muted">
              {result.domain}
            </div>
          </div>
        </div>
        <Badge tone={result.ok ? "ok" : "warn"}>
          {result.checks.filter((c) => c.passed).length}/{result.checks.length} checks
        </Badge>
      </div>

      <ul className="overflow-hidden rounded-xl border border-border">
        {result.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>

      {result.record ? <RegistryRecordCard record={result.record} /> : null}

      <p className="text-xs leading-relaxed text-muted">
        This is advisory, out-of-band verification. A passing result means the
        certificate matches the Certz CA root and on-chain registry — it does{" "}
        <span className="text-muted-strong">not</span> make the certificate
        trusted by web browsers.
      </p>
    </div>
  );
}

function CheckRow({ check }: { check: VerificationCheck }) {
  return (
    <li className="flex items-start gap-3 border-b border-border bg-surface/30 p-4 last:border-b-0">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          check.passed
            ? "bg-emerald-500/15 text-emerald-300"
            : "bg-red-500/15 text-red-300",
        )}
      >
        {check.passed ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{check.label}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">
          {check.detail}
        </div>
      </div>
    </li>
  );
}
