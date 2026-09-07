import "server-only";
import postgres from "postgres";

/**
 * Dedicated Postgres (Fly app `basebid-db` — the Fly app names predate the rename to openlaunch, reached over the private 6PN network —
 * no TLS unless DATABASE_URL carries `?sslmode=`). Lazy singleton so importing
 * a route at build time never opens a socket, and so the board can render an
 * empty "not configured" state when DATABASE_URL is unset.
 *
 * Wire conventions (see db/schema.sql):
 *   int8            → JS BigInt both ways (`types.bigint`), so micro-USD money
 *                     columns never pass through a double. Callers narrow at
 *                     the edge: money via microStr()/toMicro(), ordinals
 *                     (season, seq, rank, clicks, blocks) via Number(). Never
 *                     put a raw int8 column into NextResponse.json (BigInt is
 *                     not JSON-serializable) — shape it first.
 *   numeric (sums)  → decimal strings (default).
 *   timestamptz     → ISO-8601 strings (overridden below, not Date objects, so
 *                     RSC props / JSON shapes stay stable).
 *   undefined param → NULL (transform.undefined), so optional fields can be
 *                     passed straight through.
 * Every query is a tagged template (`sql\`… ${x}\``) → parameterized. Never
 * build SQL text from user input; `sql.unsafe` is reserved for scripts/migrate.mjs.
 */
function createSql(url: string) {
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    transform: { undefined: null },
    types: {
      bigint: postgres.BigInt,
      // Timestamps: accept ISO strings (or Date) going in, come back as ISO
      // strings instead of Date objects.
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (x: string) => new Date(x).toISOString(),
        parse: (x: string) => {
          const d = new Date(x);
          return Number.isNaN(d.getTime()) ? x : d.toISOString();
        },
      },
    },
    onnotice: () => {},
  });
}

/** The configured postgres.js client type (carries the bigint/date type map). */
export type Db = ReturnType<typeof createSql>;

let cached: Db | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function db(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  cached = createSql(url);
  return cached;
}

/** Null when unconfigured — lets pages render an empty board instead of 500. */
export function maybeDb(): Db | null {
  return dbConfigured() ? db() : null;
}

/** First row or null. */
export async function one<T extends Record<string, unknown>>(q: PromiseLike<readonly T[]>): Promise<T | null> {
  const rows = await q;
  return rows[0] ?? null;
}

export { uniqueViolation, errMessage, type PgErrorLike } from "./pg";
