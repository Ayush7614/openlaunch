/** Shared list identity and request guards. Chain is part of every token identity. */
export function launchKey(row: { chain: string; token: string }): string {
  return `${row.chain}:${row.token.toLowerCase()}`;
}

export function mergeLaunches<T extends { chain: string; token: string }>(current: T[], incoming: T[]): T[] {
  const rows = new Map(current.map((row) => [launchKey(row), row]));
  for (const row of incoming) rows.set(launchKey(row), row);
  return [...rows.values()];
}

/** Update visible values without moving, removing, or inserting a pointer target. */
export function refreshInPlace<T extends { chain: string; token: string }>(current: T[], incoming: T[]): T[] {
  const fresh = new Map(incoming.map((row) => [launchKey(row), row]));
  return current.map((row) => fresh.get(launchKey(row)) ?? row);
}
