"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable in some contexts; fail quietly.
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onCopy}
      className={cn(className)}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-300" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </Button>
  );
}

export function DownloadButton({
  value,
  filename,
  label = "Download",
  mimeType = "application/x-pem-file",
}: {
  value: string;
  filename: string;
  label?: string;
  mimeType?: string;
}) {
  function onDownload() {
    const blob = new Blob([value], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={onDownload}>
      {label}
    </Button>
  );
}
