import type { Rng } from '../core/rng';
import { FAIR_TARGET } from '../core/stats';
import type { Game } from './types';

/**
 * Push your luck — an original Pig-style dice game for two bots.
 * On your turn, roll a d6 as often as you like; each roll adds to the turn's total. Roll a 1 and the turn
 * scores nothing. Stop to bank the total. First to `goal` banked points wins.
 *
 * Bots play a fixed plan and ignore the score (that keeps every turn's odds identical, so each plan has an
 * exact points-per-turn answer):
 * - `holdAt`: keep rolling until the turn total reaches N, then bank.
 * - `rolls`: roll exactly K times (unless a 1 ends the turn), then bank.
 */
export type LuckStrategy = 'holdAt' | 'rolls';

export interface LuckConfig {
  goal: number;
  aStrategy: LuckStrategy;
  aHoldAt: number;
  aRolls: number;
  bStrategy: LuckStrategy;
  bHoldAt: number;
  bRolls: number;
  /** Who takes the first turn. 'coin' removes the first-move edge from a strategy test. */
  firstPlayer: 'coin' | 'a' | 'b';
  /** Safety cap on total turns. Hits are counted and should be 0. */
  maxTurns: number;
}

export type Bot = 'a' | 'b';

export interface LuckOutcome {
  winner: Bot;
  /** Turns played by both bots together. */
  turns: number;
  capped: boolean;
  aTurns: number;
  /** Points bot A banked, summed over its turns, and the sum of their squares (for the per-turn CI). */
  aPts: number;
  aPtsSq: number;
  aBusts: number;
  bTurns: number;
  bPts: number;
  bPtsSq: number;
  bBusts: number;
}

export interface LuckAggregate {
  n: number;
  aWins: number;
  bWins: number;
  capHits: number;
  turnsSum: number;
  turnsSumSq: number;
  aTurns: number;
  aPtsSum: number;
  aPtsSumSq: number;
  aBusts: number;
  bTurns: number;
  bPtsSum: number;
  bPtsSumSq: number;
  bBusts: number;
}

/** What one turn is worth under a plan: exact, from the distribution of banked points. */
export interface TurnExact {
  /** Expected points banked per turn. */
  perTurn: number;
  /** Chance a turn ends on a 1 and scores nothing. */
  bust: number;
}

export interface LuckExact {
  a: TurnExact;
  b: TurnExact;
}

/** One roll of a turn, for the step-1 animation. */
export interface RollEvent {
  roll: number;
  /** Turn total after this roll (0 after a bust). */
  total: number;
  bust: boolean;
}

export interface Plan {
  strategy: LuckStrategy;
  holdAt: number;
  rolls: number;
}

export const planOf = (c: LuckConfig, bot: Bot): Plan =>
  bot === 'a'
    ? { strategy: c.aStrategy, holdAt: c.aHoldAt, rolls: c.aRolls }
    : { strategy: c.bStrategy, holdAt: c.bHoldAt, rolls: c.bRolls };

/** "Banks at 20" / "Rolls 3 times". */
export function planLabel(p: Plan): string {
  return p.strategy === 'holdAt' ? `Banks at ${p.holdAt}` : `Rolls ${p.rolls} time${p.rolls === 1 ? '' : 's'}`;
}

/** Play one turn under `plan`. Returns the points banked (0 on a bust). */
export function playTurn(plan: Plan, rng: Rng, log?: (e: RollEvent) => void): number {
  let total = 0;
  let rolls = 0;
  for (;;) {
    if (plan.strategy === 'holdAt' ? total >= plan.holdAt : rolls >= plan.rolls) return total;
    const r = 1 + rng.int(6);
    rolls++;
    if (r === 1) {
      log?.({ roll: r, total: 0, bust: true });
      return 0;
    }
    total += r;
    log?.({ roll: r, total, bust: false });
  }
}

export function playLuck(c: LuckConfig, rng: Rng): LuckOutcome {
  const plans = { a: planOf(c, 'a'), b: planOf(c, 'b') };
  const o: LuckOutcome = {
    winner: 'a', turns: 0, capped: false,
    aTurns: 0, aPts: 0, aPtsSq: 0, aBusts: 0,
    bTurns: 0, bPts: 0, bPtsSq: 0, bBusts: 0,
  };
  let bot: Bot = c.firstPlayer === 'coin' ? (rng.int(2) === 0 ? 'a' : 'b') : c.firstPlayer;
  let aScore = 0;
  let bScore = 0;
  for (let t = 0; t < c.maxTurns; t++) {
    const pts = playTurn(plans[bot], rng);
    o.turns++;
    if (bot === 'a') {
      o.aTurns++;
      o.aPts += pts;
      o.aPtsSq += pts * pts;
      if (pts === 0) o.aBusts++;
      aScore += pts;
      if (aScore >= c.goal) {
        o.winner = 'a';
        return o;
      }
    } else {
      o.bTurns++;
      o.bPts += pts;
      o.bPtsSq += pts * pts;
      if (pts === 0) o.bBusts++;
      bScore += pts;
      if (bScore >= c.goal) {
        o.winner = 'b';
        return o;
      }
    }
    bot = bot === 'a' ? 'b' : 'a';
  }
  o.capped = true;
  o.winner = aScore >= bScore ? 'a' : 'b';
  return o;
}

/**
 * Exact distribution of the points one turn banks under `plan`: dist.get(v) = P(bank v), with v = 0 a bust.
 * Walks the turn's states (total so far, rolls so far) breadth-first.
 */
export function turnDistribution(plan: Plan): Map<number, number> {
  const out = new Map<number, number>();
  const add = (m: Map<number, number>, k: number, q: number) => m.set(k, (m.get(k) ?? 0) + q);
  // key: total * 64 + rolls
  let frontier = new Map<number, number>([[0, 1]]);
  while (frontier.size) {
    const next = new Map<number, number>();
    for (const [key, q] of frontier) {
      const total = Math.floor(key / 64);
      const rolls = key % 64;
      if (plan.strategy === 'holdAt' ? total >= plan.holdAt : rolls >= plan.rolls) {
        add(out, total, q);
        continue;
      }
      add(out, 0, q / 6);
      for (let r = 2; r <= 6; r++) add(next, (total + r) * 64 + rolls + 1, q / 6);
    }
    frontier = next;
  }
  return out;
}

export function turnExact(plan: Plan): TurnExact {
  const dist = turnDistribution(plan);
  let perTurn = 0;
  for (const [v, q] of dist) perTurn += v * q;
  // Plans always bank at least 2 points, so a turn scores 0 only when it busts.
  return { perTurn, bust: dist.get(0) ?? 0 };
}

export const pushLuck: Game<LuckConfig, LuckOutcome, LuckAggregate, LuckExact> = {
  id: 'pushLuck',
  defaultConfig: {
    goal: 100,
    aStrategy: 'holdAt',
    aHoldAt: 10,
    aRolls: 3,
    bStrategy: 'holdAt',
    bHoldAt: 30,
    bRolls: 3,
    firstPlayer: 'coin',
    maxTurns: 2000,
  },
  params: [
    { key: 'goal', label: 'Points to win', kind: 'int', min: 20, max: 200, step: 10, unit: 'points', help: 'First bot to bank this many points wins.' },
    {
      key: 'aStrategy', label: 'Bot A plays', kind: 'choice', help: "Bot A's plan for every turn.",
      options: [{ value: 'holdAt', label: 'Bank at a turn total' }, { value: 'rolls', label: 'Roll a fixed number of times' }],
    },
    { key: 'aHoldAt', label: 'Bot A banks at', kind: 'int', min: 2, max: 60, unit: 'points', help: 'Stop once the turn reaches this total.', when: { key: 'aStrategy', equals: 'holdAt' } },
    { key: 'aRolls', label: 'Bot A rolls', kind: 'int', min: 1, max: 12, unit: 'times', help: 'Stop after this many rolls.', when: { key: 'aStrategy', equals: 'rolls' } },
    {
      key: 'bStrategy', label: 'Bot B plays', kind: 'choice', help: "Bot B's plan for every turn.",
      options: [{ value: 'holdAt', label: 'Bank at a turn total' }, { value: 'rolls', label: 'Roll a fixed number of times' }],
    },
    { key: 'bHoldAt', label: 'Bot B banks at', kind: 'int', min: 2, max: 60, unit: 'points', help: 'Stop once the turn reaches this total.', when: { key: 'bStrategy', equals: 'holdAt' } },
    { key: 'bRolls', label: 'Bot B rolls', kind: 'int', min: 1, max: 12, unit: 'times', help: 'Stop after this many rolls.', when: { key: 'bStrategy', equals: 'rolls' } },
    {
      key: 'firstPlayer', label: 'First turn', kind: 'choice', help: 'A coin toss removes the first-move edge, so only the plans are compared.',
      options: [{ value: 'coin', label: 'Coin toss' }, { value: 'a', label: 'Bot A' }, { value: 'b', label: 'Bot B' }],
    },
  ],
  metrics: [
    {
      id: 'aWin', label: 'Bot A wins', kind: 'proportion',
      target: { ...FAIR_TARGET, labels: { below: 'Favors bot B', on: 'Fair', above: 'Favors bot A' } },
      read: (a) => ({ kind: 'proportion', k: a.aWins, n: a.n }),
    },
    {
      id: 'bWin', label: 'Bot B wins', kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.bWins, n: a.n }),
    },
    {
      id: 'aPerTurn', label: 'Bot A: points per turn', kind: 'mean', unit: 'points',
      read: (a) => ({ kind: 'mean', sum: a.aPtsSum, sumSq: a.aPtsSumSq, n: a.aTurns }),
      exact: (e) => e.a.perTurn,
    },
    {
      id: 'bPerTurn', label: 'Bot B: points per turn', kind: 'mean', unit: 'points',
      read: (a) => ({ kind: 'mean', sum: a.bPtsSum, sumSq: a.bPtsSumSq, n: a.bTurns }),
      exact: (e) => e.b.perTurn,
    },
    {
      id: 'aBust', label: "Bot A's turns that bust", kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.aBusts, n: a.aTurns }),
      exact: (e) => e.a.bust,
    },
    {
      id: 'bBust', label: "Bot B's turns that bust", kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.bBusts, n: a.bTurns }),
      exact: (e) => e.b.bust,
    },
    {
      id: 'length', label: 'Game length', kind: 'mean', unit: 'turns',
      read: (a) => ({ kind: 'mean', sum: a.turnsSum, sumSq: a.turnsSumSq, n: a.n }),
    },
  ],
  simulate: playLuck,
  emptyAggregate: () => ({
    n: 0, aWins: 0, bWins: 0, capHits: 0, turnsSum: 0, turnsSumSq: 0,
    aTurns: 0, aPtsSum: 0, aPtsSumSq: 0, aBusts: 0, bTurns: 0, bPtsSum: 0, bPtsSumSq: 0, bBusts: 0,
  }),
  accumulate(agg, o) {
    agg.n++;
    if (o.winner === 'a') agg.aWins++;
    else agg.bWins++;
    if (o.capped) agg.capHits++;
    agg.turnsSum += o.turns;
    agg.turnsSumSq += o.turns * o.turns;
    agg.aTurns += o.aTurns;
    agg.aPtsSum += o.aPts;
    agg.aPtsSumSq += o.aPtsSq;
    agg.aBusts += o.aBusts;
    agg.bTurns += o.bTurns;
    agg.bPtsSum += o.bPts;
    agg.bPtsSumSq += o.bPtsSq;
    agg.bBusts += o.bBusts;
    return agg;
  },
  exact: (c) => ({ a: turnExact(planOf(c, 'a')), b: turnExact(planOf(c, 'b')) }),
  presets: [
    {
      id: 'careful-vs-greedy', label: 'Careful vs greedy',
      blurb: 'Banking at 10 against banking at 30 looks balanced: each wins about half the games.',
      config: { aStrategy: 'holdAt', aHoldAt: 10, bStrategy: 'holdAt', bHoldAt: 30 },
    },
    {
      id: 'smart-vs-careful', label: 'Smart vs careful',
      blurb: 'Banking at 20 beats banking at 10 in about two games out of three.',
      config: { aStrategy: 'holdAt', aHoldAt: 20, bStrategy: 'holdAt', bHoldAt: 10 },
    },
    {
      id: 'smart-vs-greedy', label: 'Smart vs greedy',
      blurb: 'Banking at 20 beats banking at 30 too: one plan dominates both.',
      config: { aStrategy: 'holdAt', aHoldAt: 20, bStrategy: 'holdAt', bHoldAt: 30 },
    },
    {
      id: 'rolls-vs-smart', label: 'Three rolls vs smart',
      blurb: 'A bot that always rolls three times loses clearly to one that banks at 20.',
      config: { aStrategy: 'rolls', aRolls: 3, bStrategy: 'holdAt', bHoldAt: 20 },
    },
    {
      id: 'mirror', label: 'Mirror match',
      blurb: 'Two identical bots always look fair, so a mirror match tests nothing about the plans.',
      config: { aStrategy: 'holdAt', aHoldAt: 20, bStrategy: 'holdAt', bHoldAt: 20 },
    },
    {
      id: 'first-move', label: 'First move, same plan',
      blurb: 'With identical plans and bot A always first, the first move alone is an edge.',
      config: { aStrategy: 'holdAt', aHoldAt: 20, bStrategy: 'holdAt', bHoldAt: 20, firstPlayer: 'a' },
    },
  ],
};
