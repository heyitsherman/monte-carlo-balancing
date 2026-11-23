import type { Rng } from '../core/rng';
import { histAdd, SKILL_TARGET } from '../core/stats';
import type { Game } from './types';

/**
 * Best-of-N. The stronger player wins each single game with `edgePercent`% (games are independent).
 * A series ends as soon as one player has won a majority of `bestOf` games.
 */
export interface BestOfConfig {
  /** The stronger player's chance to win one game, in percent. */
  edgePercent: number;
  /** Series length; odd, so there is always a winner. */
  bestOf: number;
}

export interface BestOfOutcome {
  strongerWins: boolean;
  /** Games played before the series was decided. */
  games: number;
}

export interface BestOfAggregate {
  n: number;
  strongerWins: number;
  gamesSum: number;
  gamesSumSq: number;
  gamesHist: number[];
}

export interface BestOfExact {
  /** P(the stronger player wins the series): P(Binomial(N, p) ≥ (N + 1) / 2). */
  strongerWin: number;
  meanGames: number;
  /** gamesDist[g] = P(the series is decided in game g) */
  gamesDist: number[];
}

export function playSeries(c: BestOfConfig, rng: Rng): BestOfOutcome {
  const p = c.edgePercent / 100;
  const need = (c.bestOf + 1) >> 1;
  let s = 0;
  let w = 0;
  let games = 0;
  while (s < need && w < need) {
    if (rng.next() < p) s++;
    else w++;
    games++;
  }
  return { strongerWins: s === need, games };
}

function choose(n: number, k: number): number {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
}

export function exactBestOf(c: BestOfConfig): BestOfExact {
  const p = c.edgePercent / 100;
  const q = 1 - p;
  const need = (c.bestOf + 1) >> 1;
  // Decided in game g when one player gets their `need`-th win there: C(g − 1, need − 1) · p^need · q^(g − need), or the same for the other player.
  const gamesDist: number[] = new Array(2 * need).fill(0);
  let strongerWin = 0;
  let meanGames = 0;
  for (let g = need; g <= 2 * need - 1; g++) {
    const ways = choose(g - 1, need - 1);
    const s = ways * p ** need * q ** (g - need);
    const w = ways * q ** need * p ** (g - need);
    strongerWin += s;
    gamesDist[g] = s + w;
    meanGames += g * (s + w);
  }
  return { strongerWin, meanGames, gamesDist };
}

/** The shortest best-of-N (odd N) where the stronger player wins at least `target` of series, by the exact math. */
export function shortestSeries(edgePercent: number, target: number, maxBestOf = 999): number {
  for (let n = 1; n <= maxBestOf; n += 2) if (exactBestOf({ edgePercent, bestOf: n }).strongerWin >= target) return n;
  return NaN;
}

export const bestOf: Game<BestOfConfig, BestOfOutcome, BestOfAggregate, BestOfExact> = {
  id: 'bestOf',
  defaultConfig: { edgePercent: 55, bestOf: 7 },
  params: [
    { key: 'edgePercent', label: 'Stronger player wins a game', kind: 'int', min: 50, max: 80, unit: '%', help: "The stronger player's chance to win any single game." },
    { key: 'bestOf', label: 'Best of', kind: 'int', min: 1, max: 99, step: 2, unit: 'games', help: 'The series ends when one player has won a majority of this many games.' },
  ],
  metrics: [
    {
      id: 'strongerWin', label: 'Stronger player wins the series', kind: 'proportion', target: SKILL_TARGET,
      read: (a) => ({ kind: 'proportion', k: a.strongerWins, n: a.n }),
      exact: (e) => e.strongerWin,
    },
    {
      id: 'upset', label: 'Upsets: the weaker player wins', kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.n - a.strongerWins, n: a.n }),
      exact: (e) => 1 - e.strongerWin,
    },
    {
      id: 'games', label: 'Games played', kind: 'mean', unit: 'games',
      read: (a) => ({ kind: 'mean', sum: a.gamesSum, sumSq: a.gamesSumSq, n: a.n }),
      exact: (e) => e.meanGames,
    },
    {
      id: 'gamesDist', label: 'Series length', kind: 'distribution', xLabel: 'Games until the series is decided',
      read: (a) => ({ kind: 'distribution', hist: a.gamesHist }),
      exact: (e) => e.gamesDist,
    },
  ],
  simulate: playSeries,
  emptyAggregate: () => ({ n: 0, strongerWins: 0, gamesSum: 0, gamesSumSq: 0, gamesHist: [] }),
  accumulate(agg, o) {
    agg.n++;
    if (o.strongerWins) agg.strongerWins++;
    agg.gamesSum += o.games;
    agg.gamesSumSq += o.games * o.games;
    histAdd(agg.gamesHist, o.games);
    return agg;
  },
  exact: exactBestOf,
  presets: [
    {
      id: 'one-game', label: 'One game',
      blurb: 'In a single game, the weaker player still wins 45% of the time.',
      config: { edgePercent: 55, bestOf: 1 },
    },
    {
      id: 'best-of-7', label: 'Best of 7',
      blurb: 'A best-of-7 barely helps: the stronger player wins only about 61% of series.',
      config: { edgePercent: 55, bestOf: 7 },
    },
    {
      id: 'best-of-45', label: 'Best of 45',
      blurb: 'Best-of-45 is the shortest series where a 55% edge wins three series in four.',
      config: { edgePercent: 55, bestOf: 45 },
    },
    {
      id: 'big-edge', label: 'Bigger edge, best of 7',
      blurb: 'A 65% edge shows in a short series: best-of-7 is enough for 75%.',
      config: { edgePercent: 65, bestOf: 7 },
    },
  ],
};
