import Link from "next/link";
import { Container } from "@/components/ui";

const columns: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: "Product",
    links: [
      { label: "Create", href: "/create" },
      { label: "Verify", href: "/verify" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    heading: "Source",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/daBatmanCoder/Certz",
        external: true,
      },
    ],
  },
  {
    heading: "Built on",
    links: [
      {
        label: "Oasis Sapphire",
        href: "https://docs.oasis.io",
        external: true,
      },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border">
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span className="relative inline-flex h-6 w-6 items-center justify-center">
                <span className="absolute inset-0 rounded-[7px] border border-accent/50" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="font-display text-[15px] font-semibold tracking-tight">
                certz
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              A confidential, on-chain certificate authority. Research demo on
              Oasis Sapphire testnet.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                {col.heading}
              </div>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-mono text-sm text-muted-strong transition-colors hover:text-accent-strong"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="font-mono text-sm text-muted-strong transition-colors hover:text-accent-strong"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 font-mono text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>certz — confidential certificate authority</span>
          <span className="text-muted/70">
            testnet proof of concept · not a browser-trusted CA
          </span>
        </div>
      </Container>
    </footer>
  );
}
