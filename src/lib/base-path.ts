// Base-path helper for client-side absolute URLs.
//
// In production the app is served under a sub-path (e.g. `/language-learning`)
// configured via `basePath` in next.config.ts. Next.js auto-prefixes
// navigation (next/link, next/navigation) and `_next` asset URLs, but it does
// NOT prefix raw `fetch('/api/...')` calls made from the browser. Those must be
// prefixed explicitly or they hit the site root and miss the app entirely.
//
// `NEXT_PUBLIC_BASE_PATH` is inlined at build time, so this works in client
// components. In dev it is empty and `withBase` is a no-op.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * Prefix an app-absolute path (one starting with `/`) with the configured
 * base path. Safe to call in dev (returns the path unchanged when no base
 * path is set) and idempotent against already-prefixed paths.
 */
export function withBase(path: string): string {
  if (!basePath) return path;
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return `${basePath}${path}`;
}
