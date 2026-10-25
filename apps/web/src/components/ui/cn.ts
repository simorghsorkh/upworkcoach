/** Joins class names, skipping falsy values. (No tailwind-merge: our custom
 * theme names such as `text-ui` vs `text-fg` would confuse its heuristics.) */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
