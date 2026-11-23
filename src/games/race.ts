import type { Rng } from '../core/rng';
import { FAIR_TARGET, histAdd } from '../core/stats';
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
  /** Added to P2's first roll only (the talk uses 0 or 1). */
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
  /**
   * Times the lead passed from one player to the other. This and the next two describe how the
   * game felt (simulation only, no closed form). The leader is read at the start, after every full
   * round (both players have moved the same number of times, so moving first is not a lead) and at
   * the finish, where the winner leads. Ties have no leader.
   */
  leadChanges: number;
  /** The winner was behind at the halfway checkpoint. */
  comeback: boolean;
  /** The winner led at the halfway checkpoint and was never behind after it. */
  decidedEarly: boolean;
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
  leadChangesSum: number;
  leadChangesSumSq: number;
  comebacks: number;
  decidedEarly: number;
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

/** Leader at each checkpoint of the current game (reused buffer: 0 = tie, 1 or 2). */
let checkpoints = new Int8Array(64);

const leaderOf = (p1: number, p2: number): 0 | 1 | 2 => (p1 > p2 ? 1 : p2 > p1 ? 2 : 0);

/** Lead changes, comeback and early decision from the checkpoint leaders (the last one is the winner). */
function feel(count: number, winner: 1 | 2): Pick<RaceOutcome, 'leadChanges' | 'comeback' | 'decidedEarly'> {
  let leadChanges = 0;
  let last = 0;
  for (let i = 0; i < count; i++) {
    const l = checkpoints[i];
    if (l !== 0 && last !== 0 && l !== last) leadChanges++;
    if (l !== 0) last = l;
  }
  // Checkpoint 0 is the start and the last is the finish; halfway is the middle round.
  const half = Math.floor((count - 1) / 2);
  const atHalf = checkpoints[half];
  const loser = winner === 1 ? 2 : 1;
  let behindLater = false;
  for (let i = half + 1; i < count; i++) if (checkpoints[i] === loser) behindLater = true;
  return { leadChanges, comeback: atHalf === loser, decidedEarly: atHalf === winner && !behindLater };
}

/**
 * Play one game. `log`, when given, receives every turn (used to animate step 1).
 * Logging does not change RNG consumption, so logged and silent games agree.
 */
export function playRace(c: RaceConfig, rng: Rng, log?: (e: RaceEvent) => void): RaceOutcome {
  let p1 = 0;
  let p2 = c.p2HeadStart;
  let p2Bonus = c.p2FirstRollBonus;
  const need = (c.maxTurns >> 1) + 3;
  if (checkpoints.length < need) checkpoints = new Int8Array(need);
  checkpoints[0] = leaderOf(p1, p2);
  let count = 1;
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
    if (pos >= c.trackLength) {
      const winner = isP1 ? 1 : 2;
      checkpoints[count++] = winner;
      return { winner, turns: t + 1, capped: false, ...feel(count, winner) };
    }
    if (!isP1) checkpoints[count++] = leaderOf(p1, p2); // a full round is complete
  }
  const winner = p1 >= p2 ? 1 : 2;
  return { winner, turns: c.maxTurns, capped: true, ...feel(count, winner) };
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
  params: [
    { key: 'trackLength', label: 'Track length', kind: 'int', min: 10, max: 40, unit: 'squares', help: 'Squares from the start to the finish.' },
    { key: 'dieSides', label: 'Die', kind: 'int', min: 4, max: 12, step: 2, unit: 'sides', help: 'Each turn a player rolls one die with this many sides.' },
    { key: 'p2HeadStart', label: 'P2 head start', kind: 'int', min: 0, max: 6, unit: 'squares', help: 'Player 2 starts this many squares ahead.' },
    { key: 'p2FirstRollBonus', label: 'P2 first-roll bonus', kind: 'int', min: 0, max: 3, unit: 'squares', help: "Added to Player 2's first roll only." },
    { key: 'catchUp', label: 'Catch-up', kind: 'toggle', help: 'A player who is behind rolls two dice and keeps the higher.' },
  ],
  metrics: [
    {
      id: 'p1Win', label: 'P1 wins', kind: 'proportion', target: FAIR_TARGET,
      read: (a) => ({ kind: 'proportion', k: a.p1Wins, n: a.n }),
      exact: (e) => (e ? e.p1Win : null),
    },
    {
      id: 'p2Win', label: 'P2 wins', kind: 'proportion',
      target: { ...FAIR_TARGET, labels: { below: 'Favors P1', on: 'Fair', above: 'Favors P2' } },
      read: (a) => ({ kind: 'proportion', k: a.p2Wins, n: a.n }),
      exact: (e) => (e ? e.p2Win : null),
    },
    {
      id: 'length', label: 'Average game length', kind: 'mean', unit: 'turns',
      read: (a) => ({ kind: 'mean', sum: a.turnsSum, sumSq: a.turnsSumSq, n: a.n }),
      exact: (e) => (e ? e.meanTurns : null),
    },
    {
      id: 'lengthDist', label: 'Game length', kind: 'distribution', xLabel: 'Game length (turns, both players)',
      read: (a) => ({ kind: 'distribution', hist: a.turnsHist }),
      exact: (e) => (e ? e.lengthDist : null),
    },
    // How the game feels: simulation only.
    {
      id: 'leadChanges', label: 'Lead changes', kind: 'mean', unit: 'per game',
      read: (a) => ({ kind: 'mean', sum: a.leadChangesSum, sumSq: a.leadChangesSumSq, n: a.n }),
    },
    {
      id: 'comeback', label: 'Comebacks: the winner was behind at halfway', kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.comebacks, n: a.n }),
    },
    {
      id: 'decidedEarly', label: 'Decided early: the winner led from halfway on', kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.decidedEarly, n: a.n }),
    },
  ],
  simulate: (config, rng) => playRace(config, rng),
  emptyAggregate: () => ({
    n: 0, p1Wins: 0, p2Wins: 0, capHits: 0, turnsSum: 0, turnsSumSq: 0, turnsHist: [],
    leadChangesSum: 0, leadChangesSumSq: 0, comebacks: 0, decidedEarly: 0,
  }),
  accumulate(agg, o) {
    agg.n++;
    if (o.winner === 1) agg.p1Wins++;
    else agg.p2Wins++;
    if (o.capped) agg.capHits++;
    agg.turnsSum += o.turns;
    agg.turnsSumSq += o.turns * o.turns;
    histAdd(agg.turnsHist, o.turns);
    agg.leadChangesSum += o.leadChanges;
    agg.leadChangesSumSq += o.leadChanges * o.leadChanges;
    if (o.comeback) agg.comebacks++;
    if (o.decidedEarly) agg.decidedEarly++;
    return agg;
  },
  exact: (config) => (config.catchUp ? null : exactRace(config)),
};
