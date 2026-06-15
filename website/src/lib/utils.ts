/** Tiny classname joiner (avoids pulling in clsx for a handful of usages). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
