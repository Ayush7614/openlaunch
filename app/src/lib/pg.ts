/**
 * Pure helpers for Postgres errors (no `server-only` so they are unit-testable).
 * postgres.js throws `PostgresError` with SQLSTATE `code`, `constraint_name`,
 * `detail` and `message`; everything here is duck-typed on that shape.
 */
export type PgErrorLike = { code?: string; message?: string; detail?: string; constraint_name?: string };

/**
 * Unique-violation (SQLSTATE 23505) → which bb_listings key collided.
 *   tx_ref      → bb_listings_tx_ref_key: idempotent replay of the same payment
 *   token_nonce → bb_listings_product_nonce_key: the quote token was already spent
 * Anything else (or a non-23505 error) → "other" / null.
 */
export function uniqueViolation(err: unknown): "tx_ref" | "token_nonce" | "other" | null {
  if (!err || typeof err !== "object") return null;
  const e = err as PgErrorLike;
  if (e.code !== "23505") return null;
  const text = `${e.constraint_name ?? ""} ${e.message ?? ""} ${e.detail ?? ""}`;
  if (/tx_ref/.test(text)) return "tx_ref";
  if (/token_nonce|product_nonce/.test(text)) return "token_nonce";
  return "other";
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
