/** Format a unix-epoch (seconds) timestamp as a compact UTC string. */
export function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Truncate a long hex string for display: 0xabcd…1234. */
export function shortHex(value: string, lead = 10, tail = 6): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
