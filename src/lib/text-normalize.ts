/**
 * Normalize text for accent-agnostic search.
 *
 * 1. Map custom IPA characters to their nearest Latin equivalents
 * 2. NFD decomposes accented characters into base + combining mark
 * 3. Strip combining marks (Unicode category Mn)
 * 4. Lowercase
 *
 * Examples:
 *   "sǎai"      -> "saai"
 *   "krʉ̂angbin" -> "kruangbin" (ʉ -> u, then combining circumflex stripped)
 *   "lɛ́ɔ"       -> "leo"
 *   "BPLƐƐ"     -> "bplee"
 */
export function normalizeText(input: string): string {
  if (!input) return '';

  // Pre-pass: replace custom IPA chars with Latin equivalents. Done BEFORE
  // decomposition since these aren't decomposable via NFD.
  const ipaMap: Record<string, string> = {
    ɛ: 'e',
    Ɛ: 'e',
    ʉ: 'u',
    Ʉ: 'u',
    ɔ: 'o',
    Ɔ: 'o',
  };

  let result = input;
  for (const [src, dst] of Object.entries(ipaMap)) {
    result = result.replaceAll(src, dst);
  }

  // NFD decompose, then strip combining marks (Mn category).
  result = result.normalize('NFD').replace(/\p{Mn}/gu, '');

  return result.toLowerCase();
}

/**
 * Escape regex metacharacters so a user query can be safely interpolated into a
 * Postgres `~*` word-boundary pattern.
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
