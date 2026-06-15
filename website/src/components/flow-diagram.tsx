import { FileText, Globe2, ShieldCheck, PenTool, Database, SearchCheck } from "lucide-react";

const steps = [
  {
    n: "01",
    icon: FileText,
    title: "Request",
    body: "A caller asks Certz for a certificate for their domain.",
  },
  {
    n: "02",
    icon: Globe2,
    title: "DNS-01 challenge",
    body: "Certz returns a token to publish as a TXT record at _certz-challenge.<domain>.",
  },
  {
    n: "03",
    icon: ShieldCheck,
    title: "ROFL TEE verifies",
    body: "An Oasis ROFL enclave resolves DNS and attests that ownership checks out.",
  },
  {
    n: "04",
    icon: PenTool,
    title: "Confidential CA signs",
    body: "The on-chain CA contract signs the X.509 cert inside the TEE — key never exposed.",
  },
  {
    n: "05",
    icon: Database,
    title: "Recorded on-chain",
    body: "The issuance is anchored in the public registry: domain → digest, with status.",
  },
  {
    n: "06",
    icon: SearchCheck,
    title: "Verify out-of-band",
    body: "Anyone checks a presented cert against the CA root and registry, DANE-style.",
  },
];

export function FlowDiagram() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((step, i) => (
        <li
          key={step.n}
          className="group relative flex flex-col bg-background-soft p-6 transition-colors hover:bg-surface/60"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs tracking-[0.2em] text-accent-strong">
              {step.n}
            </span>
            <step.icon className="h-5 w-5 text-muted transition-colors group-hover:text-accent-strong" />
          </div>
          <h3 className="mt-6 font-display text-base font-medium text-foreground">
            {step.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
          {i < steps.length - 1 ? (
            <span className="pointer-events-none absolute -right-px top-1/2 hidden h-4 w-px -translate-y-1/2 bg-accent/30 lg:block" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
