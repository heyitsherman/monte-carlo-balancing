/** Comparisons and planning numbers for the Lab. Pure, unit-tested. */
import { Z95, type MeanCI, type Proportion } from '../core/stats';

export interface Difference {
  /** B − A */
  d: number;
  lo: number;
  hi: number;
}

/**
 * B − A for two proportions, with a 95% interval built from each side's Wilson interval
 * (Newcombe's method), so it agrees with the ± shown beside each number.
 */
export function diffProportion(a: Proportion, b: Proportion): Difference {
  const d = b.p - a.p;
  return {
    d,
    lo: d - Math.sqrt((b.p - b.lo) ** 2 + (a.hi - a.p) ** 2),
    hi: d + Math.sqrt((b.hi - b.p) ** 2 + (a.p - a.lo) ** 2),
  };
}

/** B − A for two means: the margins add in quadrature. */
export function diffMean(a: MeanCI, b: MeanCI): Difference {
  const d = b.mean - a.mean;
  const m = Math.sqrt(a.margin ** 2 + b.margin ** 2);
  return { d, lo: d - m, hi: d + m };
}

/** Does the difference's interval exclude 0, i.e. is the change detectable at this many runs? */
export const detectable = (x: Difference) => x.lo > 0 || x.hi < 0;

/**
 * Runs needed before the 95% ± is smaller than `edge`, so an edge that size can't hide inside it.
 * `sd` is the spread of one run: √(p(1 − p)) for a proportion (½ at worst), or a mean's standard deviation.
 */
export function runsToDetect(edge: number, sd: number): number {
  if (!(edge > 0) || !(sd > 0)) return NaN;
  return Math.ceil((Z95 * sd / edge) ** 2);
}

/** The spread of one run for a proportion near `p` (½ when unknown). */
export const proportionSd = (p: number) => (Number.isFinite(p) ? Math.sqrt(Math.max(p * (1 - p), 0.0025)) : 0.5);

/** A standard deviation from a mean's 95% margin and its n. */
export const meanSd = (m: MeanCI) => (m.n > 1 && Number.isFinite(m.margin) ? (m.margin * Math.sqrt(m.n)) / Z95 : NaN);

/** Rows to CSV text (RFC 4180 quoting). */
export function toCsv(rows: (string | number | boolean | null)[][]): string {
  const cell = (v: string | number | boolean | null) => {
    const s = v === null ? '' : typeof v === 'number' && !Number.isFinite(v) ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
