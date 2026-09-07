/** "12s" / "3m" / "5h" / "2d" — shared by server and client components. */
export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Render-time clock for dynamic (force-dynamic) server pages that show "ago" labels. */
export function nowMs(): number {
  return Date.now();
}
