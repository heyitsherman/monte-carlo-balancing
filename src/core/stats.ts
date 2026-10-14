/** Statistics shown on screen. Everything here is deliberately simple and visible. */

/** z for a two-sided 95% interval. */
export const Z95 = 1.959963984540054;

export interface Proportion {
  /** successes */
  k: number;
  /** trials */
  n: number;
  /** point estimate k/n (NaN when n = 0) */
  p: number;
  /** Wilson 95% interval bounds */
  lo: number;
  hi: number;
  /** half-width of the interval, in percentage points */
  marginPP: number;
}

/** Proportion with its Wilson score 95% confidence interval. */
export function wilson(k: number, n: number, z = Z95): Proportion {
  if (n <= 0) return { k, n, p: NaN, lo: 0, hi: 1, marginPP: 50 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const lo = k <= 0 ? 0 : Math.max(0, center - half);
  const hi = k >= n ? 1 : Math.min(1, center + half);
  return { k, n, p, lo, hi, marginPP: ((hi - lo) / 2) * 100 };
}

export type Verdict = 'Fair within margin' | 'Favors P1' | 'Favors P2';

/** Fairness verdict from P1's win proportion: fair iff the 95% CI contains 50%. */
export function verdict(p1: Proportion): Verdict {
  if (p1.lo <= 0.5 && p1.hi >= 0.5) return 'Fair within margin';
  return p1.p > 0.5 ? 'Favors P1' : 'Favors P2';
}

const intFmt = new Intl.NumberFormat('en-US');
export function formatInt(n: number): string {
  return intFmt.format(Math.round(n));
}

export function formatPct(p: number, digits = 1): string {
  return Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : '—';
}

export function formatMargin(prop: Proportion): string {
  return `± ${prop.marginPP.toFixed(1)} pp`;
}

/** e.g. `61.8% ± 0.9 pp (n = 10,000)` */
export function formatProportion(prop: Proportion): string {
  return `${formatPct(prop.p)} ${formatMargin(prop)} (n = ${formatInt(prop.n)})`;
}

export interface MeanCI {
  mean: number;
  /** half-width of the 95% CI of the mean */
  margin: number;
  n: number;
}

/** Mean with a normal-approximation 95% CI, from running sums. */
export function meanCI(sum: number, sumSq: number, n: number): MeanCI {
  if (n <= 0) return { mean: NaN, margin: NaN, n };
  const mean = sum / n;
  const variance = n > 1 ? Math.max(0, (sumSq - n * mean * mean) / (n - 1)) : 0;
  return { mean, margin: (Z95 * Math.sqrt(variance)) / Math.sqrt(n), n };
}

/** Increment bucket `index` of a dense histogram, growing it with zeros as needed. */
export function histAdd(hist: number[], index: number, count = 1): void {
  while (hist.length <= index) hist.push(0);
  hist[index] += count;
}

/** Histogram counts → fractions summing to 1. */
export function histNormalize(hist: number[]): number[] {
  const total = hist.reduce((s, x) => s + x, 0);
  return total > 0 ? hist.map((x) => x / total) : hist.map(() => 0);
}

export function histMean(hist: number[]): number {
  let total = 0;
  let sum = 0;
  hist.forEach((c, i) => {
    total += c;
    sum += c * i;
  });
  return total > 0 ? sum / total : NaN;
}
