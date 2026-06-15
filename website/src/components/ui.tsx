import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Page-width container with consistent gutters. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-6 sm:px-8", className)}>
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-mono text-sm tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[#0b0712] hover:bg-accent-strong shadow-[0_0_0_1px_rgba(139,109,255,0.4),0_8px_30px_-12px_rgba(139,109,255,0.7)]",
  secondary:
    "border border-border-strong bg-surface/60 text-foreground hover:border-accent/60 hover:bg-surface-2",
  ghost: "text-muted-strong hover:text-foreground hover:bg-surface/60",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5",
  md: "h-11 px-5",
};

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

interface ButtonLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  const isExternal = /^https?:\/\//.test(href);
  const classes = cn(
    buttonBase,
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={classes}
        {...props}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}

/** Small monospace pill, used for eyebrow labels and tags. */
export function Badge({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "accent" | "warn" | "ok";
}) {
  const tones: Record<string, string> = {
    default: "border-border-strong text-muted-strong",
    accent: "border-accent/40 text-accent-strong",
    warn: "border-amber-500/40 text-amber-300",
    ok: "border-emerald-500/40 text-emerald-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Section eyebrow + heading scaffold for consistent landing sections. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow ? (
        <div className="mb-4 font-mono text-xs uppercase tracking-[0.28em] text-accent-strong">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="font-display text-balance text-2xl font-medium leading-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-balance text-base leading-relaxed text-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Bordered surface card. */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface/40 p-6 transition-colors duration-200 hover:border-border-strong",
        className,
      )}
    >
      {children}
    </div>
  );
}
