import type { Rng } from '../core/rng';
import { histAdd, histPercentile, LOOT_TARGET } from '../core/stats';
import type { Game } from './types';

/**
 * Loot drops and pity timers. One player farms a rare drop: each try succeeds with `dropPercent`%.
 * With a pity timer, the drop is guaranteed on try `pity` (0 = no pity timer). One simulated "game" is one
 * player, and its outcome is how many tries they needed.
 */
export interface LootConfig {
  /** Chance per try, in percent. */
  dropPercent: number;
  /** Guaranteed on this try; 0 = no pity timer. */
  pity: number;
  /** Safety cap on tries (at 1% per try, the chance of reaching it is about 10^-437). */
  maxAttempts: number;
}

export interface LootAggregate {
  n: number;
  sum: number;
  sumSq: number;
  /** hist[k] = players who needed exactly k tries */
  hist: number[];
  /** The unluckiest player's tries. */
  max: number;
}

export interface LootExact {
  /** Average tries. */
  mean: number;
  /** dist[k] = P(exactly k tries), up to where the tail is negligible (or the pity try). */
  dist: number[];
  /** Tries by which half the players have it. */
  median: number;
  /** Tries by which 9 players in 10 have it. */
  p90: number;
  /** Tries by which 99 players in 100 have it: the unluckiest 1 in 100 need this many or more. */
  p99: number;
}

/** One player's tries until the drop. */
export function triesUntilDrop(c: LootConfig, rng: Rng): number {
  const p = c.dropPercent / 100;
  const cap = c.pity > 0 ? Math.min(c.pity, c.maxAttempts) : c.maxAttempts;
  for (let k = 1; k < cap; k++) if (rng.next() < p) return k;
  return cap;
}

/**
 * Geometric distribution, cut off by the pity timer: P(k) = (1 − p)^(k − 1) · p before the pity try, and
 * everyone left gets it on the pity try. Average = (1 − (1 − p)^pity) / p, or 1 / p without pity.
 */
export function exactLoot(c: LootConfig): LootExact {
  const p = c.dropPercent / 100;
  const dist: number[] = [0];
  let left = 1;
  for (let k = 1; ; k++) {
    if (c.pity > 0 && k >= c.pity) {
      dist.push(left);
      break;
    }
    dist.push(left * p);
    left *= 1 - p;
    if (left < 1e-12 || k >= c.maxAttempts) break;
  }
  const mean = c.pity > 0 ? (1 - (1 - p) ** c.pity) / p : 1 / p;
  return {
    mean,
    dist,
    median: histPercentile(dist, 0.5),
    p90: histPercentile(dist, 0.9),
    p99: histPercentile(dist, 0.99),
  };
}

export const loot: Game<LootConfig, number, LootAggregate, LootExact> = {
  id: 'loot',
  defaultConfig: { dropPercent: 5, pity: 0, maxAttempts: 100_000 },
  params: [
    { key: 'dropPercent', label: 'Drop chance', kind: 'int', min: 1, max: 20, unit: '% per try', help: 'Chance that one try drops the item.' },
    { key: 'pity', label: 'Pity timer', kind: 'int', min: 0, max: 100, step: 5, unit: 'tries', help: 'The item is guaranteed on this try. 0 means no pity timer.' },
  ],
  metrics: [
    {
      id: 'mean', label: 'Average tries', kind: 'mean', unit: 'tries', target: LOOT_TARGET,
      read: (a) => ({ kind: 'mean', sum: a.sum, sumSq: a.sumSq, n: a.n }),
      exact: (e) => e.mean,
    },
    {
      id: 'tries', label: 'Tries needed', kind: 'distribution', xLabel: 'Tries until the drop',
      read: (a) => ({ kind: 'distribution', hist: a.hist }),
      exact: (e) => e.dist,
    },
  ],
  simulate: triesUntilDrop,
  emptyAggregate: () => ({ n: 0, sum: 0, sumSq: 0, hist: [], max: 0 }),
  accumulate(agg, k) {
    agg.n++;
    agg.sum += k;
    agg.sumSq += k * k;
    histAdd(agg.hist, k);
    if (k > agg.max) agg.max = k;
    return agg;
  },
  exact: exactLoot,
  presets: [
    {
      id: 'plain', label: '5%, no pity',
      blurb: 'An average of 20 tries hides the droughts: 1 player in 100 needs 90 tries or more.',
      config: { dropPercent: 5, pity: 0 },
    },
    {
      id: 'pity', label: '5%, pity at 40',
      blurb: 'A pity timer at 40 ends the droughts, but the average falls to about 17: too generous.',
      config: { dropPercent: 5, pity: 40 },
    },
    {
      id: 'tuned', label: '4%, pity at 40',
      blurb: 'Lower the chance with the pity timer on: the average is back to 20 and nobody waits past 40.',
      config: { dropPercent: 4, pity: 40 },
    },
    {
      id: 'lower', label: '4%, no pity',
      blurb: 'Lowering the chance alone makes the droughts worse: 1 player in 100 needs over 110 tries.',
      config: { dropPercent: 4, pity: 0 },
    },
  ],
};
