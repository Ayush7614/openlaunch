/**
 * Pure helpers for the route/global error boundaries and the 404 page
 * (node --test loads this; the .tsx pages stay thin).
 *
 * Next.js App Router injects `{ error, reset }` into `error.tsx` and
 * `global-error.tsx` — never a `retry` prop. `sanitizeDigest` keeps the
 * optional `error.digest` display safe: only short opaque ids render,
 * everything else is dropped so creator-adjacent strings can never break
 * out of the error paragraph.
 */

export type ErrorPageKind = "route" | "global" | "not-found";

const DIGEST_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Keep only short opaque digest ids; drop anything that looks like markup. */
export function sanitizeDigest(digest: unknown): string | null {
  if (typeof digest !== "string") return null;
  const d = digest.trim();
  if (d.length === 0 || d.length > 64) return null;
  return DIGEST_RE.test(d) ? d : null;
}

/** Big numeric heading rendered on the error/404 pages. */
export function errorHeading(kind: ErrorPageKind): "500" | "404" {
  return kind === "not-found" ? "404" : "500";
}

/**
 * Short human body copy. Route/global errors reassure that funds are
 * on-chain (only the site broke); the 404 stays generic on purpose — it
 * renders for every unknown route, not just token pages.
 */
export function errorBody(kind: ErrorPageKind): string {
  if (kind === "not-found") return "Nothing here. The page you asked for does not exist.";
  if (kind === "global") return "Something broke. Your funds are on-chain — this is only the site.";
  return "Something broke on this page. Your funds are on-chain — this is only the site.";
}

/** Accessible label for the error/404 landmark region. */
export function errorRegionLabel(kind: ErrorPageKind): string {
  if (kind === "not-found") return "Page not found";
  return "Page error";
}
