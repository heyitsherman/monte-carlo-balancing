import type { Rng } from '../core/rng';
import { BOSS_TARGET } from '../core/stats';
import type { Game } from './types';

/**
 * A boss fight. Each round the hero strikes first for 1d`heroDie` damage; if the boss is still standing,
 * it strikes back for 1d`bossDie`. Whoever drops to 0 HP first loses. One simulated "game" is one first try.
 */
export interface BossConfig {
  heroHp: number;
  bossHp: number;
  heroDie: number;
  bossDie: number;
  /** Safety cap on rounds. Hits are counted and should be 0. */
  maxRounds: number;
}

export interface BossOutcome {
  heroWins: boolean;
  rounds: number;
  /** Hero HP left at the end (0 when the boss won). */
  heroHpLeft: number;
  /** Won with a quarter of the hero's HP or less left. */
  close: boolean;
  capped: boolean;
}

export interface BossAggregate {
  n: number;
  heroWins: number;
  roundsSum: number;
  roundsSumSq: number;
  /** Wins with a quarter of the hero's HP or less left: the fights that felt close. */
  closeWins: number;
  capHits: number;
}

export interface BossExact {
  heroWin: number;
  meanRounds: number;
}

/** One round, for the step-1 animation. `bossHit` is 0 when the hero's strike ended the fight. */
export interface RoundEvent {
  round: number;
  heroHit: number;
  bossHit: number;
  heroHp: number;
  bossHp: number;
}

export function fightBoss(c: BossConfig, rng: Rng, log?: (e: RoundEvent) => void): BossOutcome {
  let hero = c.heroHp;
  let boss = c.bossHp;
  for (let round = 1; round <= c.maxRounds; round++) {
    const heroHit = 1 + rng.int(c.heroDie);
    boss = Math.max(0, boss - heroHit);
    if (boss === 0) {
      log?.({ round, heroHit, bossHit: 0, heroHp: hero, bossHp: 0 });
      return { heroWins: true, rounds: round, heroHpLeft: hero, close: hero * 4 <= c.heroHp, capped: false };
    }
    const bossHit = 1 + rng.int(c.bossDie);
    hero = Math.max(0, hero - bossHit);
    log?.({ round, heroHit, bossHit, heroHp: hero, bossHp: boss });
    if (hero === 0) return { heroWins: false, rounds: round, heroHpLeft: 0, close: false, capped: false };
  }
  return { heroWins: false, rounds: c.maxRounds, heroHpLeft: hero, close: false, capped: true };
}

/** Exact win chance and expected rounds by dynamic programming over (hero HP, boss HP) at the start of a round. */
export function exactBoss(c: BossConfig): BossExact {
  const H = c.heroHp;
  const B = c.bossHp;
  // win[h][b], rounds[h][b]: from the start of a round with h and b HP left. Both only decrease, so fill upward.
  const win: Float64Array[] = [];
  const rounds: Float64Array[] = [];
  for (let h = 0; h <= H; h++) {
    win.push(new Float64Array(B + 1));
    rounds.push(new Float64Array(B + 1));
  }
  const ph = 1 / c.heroDie;
  const pb = 1 / c.bossDie;
  for (let h = 1; h <= H; h++) {
    for (let b = 1; b <= B; b++) {
      let w = 0;
      let r = 1;
      for (let x = 1; x <= c.heroDie; x++) {
        const nb = b - x;
        if (nb <= 0) {
          w += ph;
          continue;
        }
        for (let y = 1; y <= c.bossDie; y++) {
          const nh = h - y;
          if (nh <= 0) continue; // the boss wins this round: no more rounds, no win
          w += ph * pb * win[nh][nb];
          r += ph * pb * rounds[nh][nb];
        }
      }
      win[h][b] = w;
      rounds[h][b] = r;
    }
  }
  return { heroWin: win[H][B], meanRounds: rounds[H][B] };
}

export const boss: Game<BossConfig, BossOutcome, BossAggregate, BossExact> = {
  id: 'boss',
  defaultConfig: { heroHp: 30, bossHp: 32, heroDie: 6, bossDie: 6, maxRounds: 1000 },
  params: [
    { key: 'heroHp', label: 'Hero HP', kind: 'int', min: 10, max: 60, unit: 'HP', help: "The hero's health at the start of the fight." },
    { key: 'bossHp', label: 'Boss HP', kind: 'int', min: 10, max: 60, unit: 'HP', help: "The boss's health at the start of the fight." },
    { key: 'heroDie', label: 'Hero damage', kind: 'int', min: 4, max: 12, step: 2, unit: 'sided die', help: 'Each round the hero hits for one roll of this die.' },
    { key: 'bossDie', label: 'Boss damage', kind: 'int', min: 4, max: 12, step: 2, unit: 'sided die', help: 'Each round the boss hits back for one roll of this die.' },
  ],
  metrics: [
    {
      id: 'heroWin', label: 'Players who win on the first try', kind: 'proportion', target: BOSS_TARGET,
      read: (a) => ({ kind: 'proportion', k: a.heroWins, n: a.n }),
      exact: (e) => e.heroWin,
    },
    {
      id: 'bossWin', label: 'The boss wins', kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.n - a.heroWins, n: a.n }),
      exact: (e) => 1 - e.heroWin,
    },
    {
      id: 'rounds', label: 'Fight length', kind: 'mean', unit: 'rounds',
      read: (a) => ({ kind: 'mean', sum: a.roundsSum, sumSq: a.roundsSumSq, n: a.n }),
      exact: (e) => e.meanRounds,
    },
    {
      id: 'closeWins', label: 'Close wins: a quarter of the HP or less left', kind: 'proportion',
      read: (a) => ({ kind: 'proportion', k: a.closeWins, n: a.n }),
    },
  ],
  simulate: (c, rng) => fightBoss(c, rng),
  emptyAggregate: () => ({ n: 0, heroWins: 0, roundsSum: 0, roundsSumSq: 0, closeWins: 0, capHits: 0 }),
  accumulate(agg, o) {
    agg.n++;
    if (o.heroWins) agg.heroWins++;
    agg.roundsSum += o.rounds;
    agg.roundsSumSq += o.rounds * o.rounds;
    if (o.close) agg.closeWins++;
    if (o.capped) agg.capHits++;
    return agg;
  },
  exact: exactBoss,
  presets: [
    {
      id: 'fair', label: 'A fair boss (32 HP)',
      blurb: 'A fair boss sends half the players back to the start.',
      config: { bossHp: 32 },
    },
    {
      id: 'target', label: 'On target (28 HP)',
      blurb: 'At 28 HP, about 70% of players win on their first try: unfair on purpose, and on target.',
      config: { bossHp: 28 },
    },
    {
      id: 'easy', label: 'Too easy (24 HP)',
      blurb: 'At 24 HP nearly 9 players in 10 win on the first try: too easy to feel like a boss.',
      config: { bossHp: 24 },
    },
    {
      id: 'hard', label: 'Too hard (36 HP)',
      blurb: 'At 36 HP fewer than 1 player in 3 wins on the first try.',
      config: { bossHp: 36 },
    },
  ],
};
