import type { Rng } from '../core/rng';
import { histAdd } from '../core/stats';
import type { Game } from './types';

/**
 * The First-Player Problem — an invented 2-player race.
 * Track of `trackLength` squares. Players alternate, P1 first; roll one d`dieSides`, move.
 * First to reach or pass `trackLength` wins immediately.
 */
export interface RaceConfig {
  trackLength: number;
  dieSides: number;
  /** P2 starts this many squares ahead (0–6). */
  p2HeadStart: number;
  /** Added to P2's first roll only (0 or 1). */
  p2FirstRollBonus: number;
  /** At the start of a turn, a player strictly behind rolls 2 dice and keeps the higher. */
  catchUp: boolean;
  /** Safety cap on total turns. Hits are counted and should be 0. */
  maxTurns: number;
}

export interface RaceOutcome {
  winner: 1 | 2;
  /** Total turns played (both players' turns counted). */
  turns: number;
  /** True when maxTurns was hit (should never happen). */
  capped: boolean;
}

export interface RaceAggregate {
  n: number;
  p1Wins: number;
  p2Wins: number;
  capHits: number;
  turnsSum: number;
  turnsSumSq: number;
  /** turnsHist[t] = games that lasted exactly t turns */
  turnsHist: number[];
}

export interface RaceExact {
  p1Win: number;
  p2Win: number;
  meanTurns: number;
  /** lengthDist[t] = P(game lasts exactly t turns) */
  lengthDist: number[];
}

export interface RaceEvent {
  turn: number;
  player: 1 | 2;
  /** Dice rolled this turn (two when the catch-up rule fired). */
  rolls: number[];
  /** Squares moved, after keep-best and bonus. */
  move: number;
  bonus: number;
  catchUp: boolean;
  positions: [number, number];
}

/** Default track length, calibrated so baseline P1 win rate sits in 57–65% (see README). */
export const DEFAULT_TRACK_LENGTH = 20;

/**
 * Play one game. `log`, when given, receives every turn (used to animate step 1).
 * Logging does not change RNG consumption, so logged and silent games agree.
 */
export function playRace(c: RaceConfig, rng: Rng, log?: (e: RaceEvent) => void): RaceOutcome {
  let p1 = 0;
  let p2 = c.p2HeadStart;
  let p2Bonus = c.p2FirstRollBonus;
  for (let t = 0; t < c.maxTurns; t++) {
    const isP1 = (t & 1) === 0;
    const mine = isP1 ? p1 : p2;
    const theirs = isP1 ? p2 : p1;
    const behind = c.catchUp && mine < theirs;
    const r1 = 1 + rng.int(c.dieSides);
    let roll = r1;
    let r2 = 0;
    if (behind) {
      r2 = 1 + rng.int(c.dieSides);
      if (r2 > roll) roll = r2;
    }
    let bonus = 0;
    if (!isP1 && p2Bonus) {
      bonus = p2Bonus;
      p2Bonus = 0;
    }
    const pos = mine + roll + bonus;
    if (isP1) p1 = pos;
    else p2 = pos;
    if (log) {
      log({
        turn: t + 1,
        player: isP1 ? 1 : 2,
        rolls: behind ? [r1, r2] : [r1],
        move: roll + bonus,
        bonus,
        catchUp: behind,
        positions: [p1, p2],
      });
    }
    if (pos >= c.trackLength) return { winner: isP1 ? 1 : 2, turns: t + 1, capped: false };
  }
  return { winner: p1 >= p2 ? 1 : 2, turns: c.maxTurns, capped: true };
}

/**
 * Distribution of the number of own turns a lone player needs to finish.
 * dist[k] = P(finish on own k-th turn). Valid because, without catch-up, players are independent.
 */
export function turnsToFinish(
  start: number,
  trackLength: number,
  sides: number,
  firstRollBonus: number,
  maxOwnTurns = 1000,
): number[] {
  if (start >= trackLength) return [1];
  const dist: number[] = [0];
  let cur = new Float64Array(trackLength);
  cur[start] = 1;
  let remaining = 1;
  for (let k = 1; k <= maxOwnTurns && remaining > 1e-15; k++) {
    const next = new Float64Array(trackLength);
    const bonus = k === 1 ? firstRollBonus : 0;
    let finished = 0;
    for (let pos = 0; pos < trackLength; pos++) {
      const q = cur[pos];
      if (q === 0) continue;
      const share = q / sides;
      for (let r = 1; r <= sides; r++) {
        const np = pos + r + bonus;
        if (np >= trackLength) finished += share;
        else next[np] += share;
      }
    }
    dist.push(finished);
    remaining -= finished;
    cur = next;
  }
  return dist;
}

/** Exact answer by DP. Only defined without catch-up (players must be independent). */
export function exactRace(c: RaceConfig): RaceExact {
  if (c.catchUp) throw new Error('exactRace: no closed form with catchUp enabled');
  const t1 = turnsToFinish(0, c.trackLength, c.dieSides, 0);
  const t2 = turnsToFinish(c.p2HeadStart, c.trackLength, c.dieSides, c.p2FirstRollBonus);
  const K = Math.max(t1.length, t2.length);
  const at = (d: number[], k: number) => (k < d.length ? d[k] : 0);
  // survival s[k] = P(T >= k)
  const surv = (d: number[]) => {
    const s = new Array<number>(K + 2).fill(0);
    for (let k = K; k >= 0; k--) s[k] = at(d, k) + s[k + 1];
    return s;
  };
  const s1 = surv(t1);
  const s2 = surv(t2);
  const lengthDist: number[] = [0];
  let p1Win = 0;
  let meanTurns = 0;
  for (let k = 1; k <= K; k++) {
    // P1 finishes on own turn k (game turn 2k-1) and P2 has not yet: P(T1 = k, T2 >= k)
    const a = at(t1, k) * s2[k];
    // P2 finishes on own turn k (game turn 2k) and P1 has not: P(T2 = k, T1 > k)
    const b = at(t2, k) * s1[k + 1];
    p1Win += a;
    lengthDist[2 * k - 1] = a;
    lengthDist[2 * k] = b;
    meanTurns += a * (2 * k - 1) + b * 2 * k;
  }
  return { p1Win, p2Win: 1 - p1Win, meanTurns, lengthDist };
}

export const race: Game<RaceConfig, RaceOutcome, RaceAggregate, RaceExact | null> = {
  id: 'race',
  defaultConfig: {
    trackLength: DEFAULT_TRACK_LENGTH,
    dieSides: 6,
    p2HeadStart: 0,
    p2FirstRollBonus: 0,
    catchUp: false,
    maxTurns: 1000,
  },
  simulate: (config, rng) => playRace(config, rng),
  emptyAggregate: () => ({ n: 0, p1Wins: 0, p2Wins: 0, capHits: 0, turnsSum: 0, turnsSumSq: 0, turnsHist: [] }),
  accumulate(agg, o) {
    agg.n++;
    if (o.winner === 1) agg.p1Wins++;
    else agg.p2Wins++;
    if (o.capped) agg.capHits++;
    agg.turnsSum += o.turns;
    agg.turnsSumSq += o.turns * o.turns;
    histAdd(agg.turnsHist, o.turns);
    return agg;
  },
  exact: (config) => (config.catchUp ? null : exactRace(config)),
};
