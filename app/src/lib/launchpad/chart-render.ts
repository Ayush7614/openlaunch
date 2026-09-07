import { scaleCandles, type Candle } from "./candles.ts";

// Lightweight Charts validates every OHLC/line/histogram value against this
// bound, independently of the series' custom price formatter or minMove.
export const CHART_SAFE_VALUE = Number.MAX_SAFE_INTEGER / 100;
type PreparedChart = {
  display: Candle[];
  render: Candle[];
  priceDivisor: number;
  volumeDivisor: number;
  unavailable: boolean;
};
const unavailable = (): PreparedChart => ({ display: [], render: [], priceDivisor: 1, volumeDivisor: 1, unavailable: true });
const priceKeys = ["open", "high", "low", "close"] as const;

/** Powers of ten keep canvas coordinates moderate without changing labels. */
export function chartDivisor(peak: number): number {
  if (peak === 0 || (peak >= 1e-6 && peak < 1e9)) return 1;
  return 10 ** Math.max(-300, Math.min(300, Math.floor(Math.log10(peak)) - 5));
}

/**
 * Keep actual values separate from library coordinates. Price and quote volume
 * have independent divisors; multiplying an axis/crosshair label restores units.
 * Invalid or unrepresentable data is unavailable, never clamped or fabricated.
 */
export function prepareChartSeries(dense: readonly Candle[], priceFactors: readonly number[]): PreparedChart {
  if (priceFactors.some((factor) => !Number.isFinite(factor) || factor <= 0)) return unavailable();
  let previous = -Infinity;
  for (const bar of dense) {
    if (!Number.isSafeInteger(bar.t) || bar.t < 0 || bar.t <= previous
      || priceKeys.some((key) => !Number.isFinite(bar[key]) || bar[key] <= 0)
      || !Number.isFinite(bar.volume) || bar.volume < 0
      || !Number.isSafeInteger(bar.trades) || bar.trades < 0
      || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) return unavailable();
    previous = bar.t;
  }
  // Apply each factor separately; multiplying the factors first could overflow
  // even when a tiny quote price makes the final displayed value representable.
  let display = [...dense];
  for (const factor of priceFactors) display = scaleCandles(display, factor);
  let pricePeak = 0;
  let volumePeak = 0;
  for (const bar of display) {
    if (priceKeys.some((key) => !Number.isFinite(bar[key]) || bar[key] <= 0)) return unavailable();
    pricePeak = Math.max(pricePeak, bar.high);
    volumePeak = Math.max(volumePeak, bar.volume);
  }
  const priceDivisor = chartDivisor(pricePeak);
  const volumeDivisor = chartDivisor(volumePeak);
  const render = display.map((bar) => ({ ...bar, open: bar.open / priceDivisor, high: bar.high / priceDivisor,
    low: bar.low / priceDivisor, close: bar.close / priceDivisor, volume: bar.volume / volumeDivisor }));
  for (const bar of render) {
    if (priceKeys.some((key) => !Number.isFinite(bar[key]) || bar[key] <= 0 || bar[key] > CHART_SAFE_VALUE)
      || !Number.isFinite(bar.volume) || bar.volume > CHART_SAFE_VALUE) return unavailable();
  }
  return { display, render, priceDivisor, volumeDivisor, unavailable: false };
}
