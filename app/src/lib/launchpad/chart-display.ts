/** lightweight-charts parses colours itself; CSS color-mix() is not supported. */
export function chartAlpha(hex: string, opacity: number): string {
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error("Chart token must be an opaque six-digit hex colour");
  const rgb = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return `rgba(${rgb.join(", ")}, ${Math.max(0, Math.min(1, opacity))})`;
}

/** A market cap in a quote with no USD conversion must never get a dollar sign. */
export function chartValueUnit(unit: "usd" | "quote" | "mcap", quoteSymbol: string, usdAvailable: boolean): string {
  return unit === "quote" || (unit === "mcap" && !usdAvailable) ? quoteSymbol : "USD";
}
