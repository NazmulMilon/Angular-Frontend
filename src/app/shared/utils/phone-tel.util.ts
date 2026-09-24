/**
 * Utilities for building telephone links in templates.
 *
 * Job/vendor APIs often return numbers prefixed with {@code tel:} (legacy formatting).
 * Templates must not concatenate another {@code tel:} on top of that.
 */

/** Removes one or more leading {@code tel:} schemes (case-insensitive). */
function stripLeadingTelSchemes(value: string): string {
  let s = value.trim();
  while (/^tel:/i.test(s)) {
    s = s.slice(4).trim();
  }
  return s.trim();
}

/**
 * Builds an {@code href} value for a phone anchor: always exactly one {@code tel:} prefix.
 *
 * @param phone Raw value from API, grid row, or form (may already start with {@code tel:})
 * @returns {@code tel:…} for use with {@code [href]}, or {@code '#'} when empty / not dialable
 */
export function telHref(phone: unknown): string {
  if (phone == null) return '#';
  const raw = String(phone).trim();
  if (!raw) return '#';
  const body = stripLeadingTelSchemes(raw);
  if (!body) return '#';
  return `tel:${body}`;
}
