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

/** An estimate with its 95% interval: a proportion, or a mean (e.g. average tries until a drop). */
export interface Interval {
  p: number;
  lo: number;
  hi: number;
}

/** A mean as an interval, so it can be assessed against a target like a proportion. */
export const meanInterval = (m: MeanCI): Interval => ({ p: m.mean, lo: m.mean - m.margin, hi: m.mean + m.margin });

/**
 * A design target for an estimate: "aim for `center`, anything within ± `tolerance` is fine".
 * Balanced means on target, and the target is a design decision, not always 50%. Proportions use
 * fractions (0.7 = 70%); means use their own unit (20 tries).
 */
export interface Target {
  /** e.g. 0.5 for fairness, 0.7 for a boss you should usually beat */
  center: number;
  /** half-width of the acceptable band, e.g. 0.02 for ± 2 pp */
  tolerance: number;
  labels: {
    /** whole CI below the band, e.g. "Favors P2" or "Too hard" */
    below: string;
    /** whole CI inside the band, e.g. "Fair" or "On target" */
    on: string;
    /** whole CI above the band, e.g. "Favors P1" or "Too easy" */
    above: string;
    /** CI crosses a band edge; defaults to "Not enough data: run more" */
    unclear?: string;
  };
}

export type AssessmentStatus = 'below' | 'on' | 'above' | 'unclear';

export interface Assessment {
  status: AssessmentStatus;
  /** The target's label for `status`, ready to show. */
  label: string;
  /** The acceptable band. */
  bandLo: number;
  bandHi: number;
}

export const NOT_ENOUGH_DATA = 'Not enough data: run more';

/**
 * Compare a proportion's 95% CI with a target band.
 * - on: the whole CI lies inside the band
 * - below / above: the whole CI lies outside the band
 * - unclear: the CI crosses a band edge, so more runs are needed to tell
 */
export function assess(prop: Interval, target: Target): Assessment {
  const bandLo = target.center - target.tolerance;
  const bandHi = target.center + target.tolerance;
  const eps = 1e-12;
  let status: AssessmentStatus;
  if (!Number.isFinite(prop.p)) status = 'unclear';
  else if (prop.hi < bandLo - eps) status = 'below';
  else if (prop.lo > bandHi + eps) status = 'above';
  else if (prop.lo >= bandLo - eps && prop.hi <= bandHi + eps) status = 'on';
  else status = 'unclear';
  const label = status === 'unclear' ? (target.labels.unclear ?? NOT_ENOUGH_DATA) : target.labels[status];
  return { status, label, bandLo, bandHi };
}

/**
 * Fairness target used by symmetric two-player games: 50% ± 3 pp (plan D13). Wide enough that a
 * rule which is fair in truth (the race's 2-square head start, 48.4%) reads "Fair" at 10,000 runs,
 * narrow enough that a 5-point edge never does.
 */
export const FAIR_TARGET: Target = {
  center: 0.5,
  tolerance: 0.03,
  labels: { below: 'Favors P2', on: 'Fair', above: 'Favors P1' },
};

/** A boss most players should beat on the first try: 70% ± 3 (plan D6). */
export const BOSS_TARGET: Target = {
  center: 0.7,
  tolerance: 0.03,
  labels: { below: 'Too hard', on: 'On target', above: 'Too easy' },
};

/** A handicap for the newer player: Player 2 wins 58% ± 3 (plan, Phase 4). */
export const HANDICAP_TARGET: Target = {
  center: 0.58,
  tolerance: 0.03,
  labels: { below: 'Not enough help', on: 'On target', above: 'Too much help' },
};

/** A match format where skill shows: the stronger player wins at least 75% (plan D11). One-sided, so the band runs to 100%. */
export const SKILL_TARGET: Target = {
  center: 0.875,
  tolerance: 0.125,
  labels: { below: 'Too much luck', on: 'Skill wins', above: 'Skill wins' },
};

/** A rare drop that keeps its designed average: 20 tries ± 1 (plan D11). */
export const LOOT_TARGET: Target = {
  center: 20,
  tolerance: 1,
  labels: { below: 'Too generous', on: 'On target', above: 'Too stingy' },
};

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

/**
 * Smallest value k such that at least `q` of the mass is at or below k (e.g. q = 0.99: "99 players in 100
 * needed k tries or fewer"). Works on counts and on probabilities. NaN when empty.
 */
export function histPercentile(hist: number[], q: number): number {
  const total = hist.reduce((s, x) => s + x, 0);
  if (total <= 0) return NaN;
  let cum = 0;
  for (let i = 0; i < hist.length; i++) {
    cum += hist[i];
    if (cum >= q * total - 1e-9 * total) return i;
  }
  return hist.length - 1;
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
