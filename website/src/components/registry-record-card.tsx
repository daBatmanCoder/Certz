import type { RegistryRecord } from "@/lib/certz";
import { formatDate, shortHex } from "@/lib/format";
import { cn } from "@/lib/utils";

const statusStyles: Record<RegistryRecord["status"], string> = {
  valid: "border-emerald-500/40 text-emerald-300 bg-emerald-500/5",
  expired: "border-amber-500/40 text-amber-300 bg-amber-500/5",
  revoked: "border-red-500/40 text-red-300 bg-red-500/5",
  unknown: "border-border-strong text-muted bg-surface/40",
};

function Row({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "break-all text-sm text-foreground sm:text-right",
          mono && "font-mono",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export function RegistryRecordCard({ record }: { record: RegistryRecord }) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-sm font-medium uppercase tracking-[0.16em] text-muted">
          On-chain registry record
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]",
            statusStyles[record.status],
          )}
        >
          {record.status}
        </span>
      </div>
      <dl>
        <Row label="Domain">{record.domain}</Row>
        <Row label="Cert digest (SHA-256)">{shortHex(record.certificateDigest, 14, 8)}</Row>
        <Row label="SANs" mono>
          {record.subjectAltNames.join(", ")}
        </Row>
        <Row label="Not before">{formatDate(record.notBefore)} UTC</Row>
        <Row label="Not after">{formatDate(record.notAfter)} UTC</Row>
        {typeof record.issuedAtBlock === "number" ? (
          <Row label="Issued at block">#{record.issuedAtBlock.toLocaleString()}</Row>
        ) : null}
        {record.issuanceTxHash ? (
          <Row label="Issuance tx">{shortHex(record.issuanceTxHash, 12, 8)}</Row>
        ) : null}
      </dl>
    </div>
  );
}
