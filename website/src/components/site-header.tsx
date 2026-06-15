"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ButtonLink } from "@/components/ui";

const nav = [
  { href: "/create", label: "Create" },
  { href: "/verify", label: "Verify" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 glass">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5"
          aria-label="Certz home"
        >
          <span className="relative inline-flex h-6 w-6 items-center justify-center">
            <span className="absolute inset-0 rounded-[7px] border border-accent/50" />
            <span className="absolute inset-1 rounded-[4px] bg-accent/20 transition-colors group-hover:bg-accent/40" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_2px_var(--accent-glow)]" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
            certz
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 font-mono text-sm transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink
            href="https://github.com/daBatmanCoder/Certz"
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            GitHub
          </ButtonLink>
          <ButtonLink href="/create" variant="primary" size="sm">
            Create a certificate
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
