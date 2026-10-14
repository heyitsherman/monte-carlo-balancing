import type { Rng } from '../core/rng';
import type { Game } from './types';

/**
 * Dice Duel — Risk-style battle.
 * Attacker rolls `attackerDice`, defender rolls `defenderDice` (default 3 vs 2, d6).
 * Both sorted descending; highest vs highest, second vs second, ...
 * Higher die wins each comparison; ties go to the defender.
 */
export interface DuelConfig {
  attackerDice: number;
  defenderDice: number;
  sides: number;
}

export type DuelOutcome = 'attackerWinsBoth' | 'split' | 'defenderWinsBoth';

export interface DuelAggregate {
  n: number;
  attackerWinsBoth: number;
  split: number;
  defenderWinsBoth: number;
}

export interface ExactFraction {
  num: number;
  den: number;
  p: number;
}

export type DuelExact = Record<DuelOutcome, ExactFraction>;

export const DUEL_OUTCOMES: readonly DuelOutcome[] = ['attackerWinsBoth', 'split', 'defenderWinsBoth'];

export interface Battle {
  attacker: number[]; // sorted descending
  defender: number[]; // sorted descending
  /** per comparison: true = attacker won it */
  comparisons: boolean[];
  outcome: DuelOutcome;
}

function sortDesc(a: number[]): number[] {
  // insertion sort; arrays have ≤ 3 elements
  for (let i = 1; i < a.length; i++) {
    const v = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] < v) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = v;
  }
  return a;
}

function judge(att: number[], def: number[]): { comparisons: boolean[]; outcome: DuelOutcome } {
  const m = Math.min(att.length, def.length);
  const comparisons: boolean[] = [];
  let wins = 0;
  for (let i = 0; i < m; i++) {
    const w = att[i] > def[i];
    comparisons.push(w);
    if (w) wins++;
  }
  const outcome: DuelOutcome = wins === m ? 'attackerWinsBoth' : wins === 0 ? 'defenderWinsBoth' : 'split';
  return { comparisons, outcome };
}

/** Roll one battle, keeping the dice (used to draw step 1). Consumes the RNG exactly like `simulate`. */
export function rollBattle(config: DuelConfig, rng: Rng): Battle {
  const attacker: number[] = [];
  const defender: number[] = [];
  for (let i = 0; i < config.attackerDice; i++) attacker.push(1 + rng.int(config.sides));
  for (let i = 0; i < config.defenderDice; i++) defender.push(1 + rng.int(config.sides));
  sortDesc(attacker);
  sortDesc(defender);
  return { attacker, defender, ...judge(attacker, defender) };
}

/** Enumerate all sides^(a+d) rolls. 6^5 = 7,776 for the default config. */
export function exactDuel(config: DuelConfig): DuelExact {
  const total = config.attackerDice + config.defenderDice;
  const den = config.sides ** total;
  const counts: Record<DuelOutcome, number> = { attackerWinsBoth: 0, split: 0, defenderWinsBoth: 0 };
  const dice = new Array<number>(total).fill(1);
  for (let idx = 0; idx < den; idx++) {
    let rem = idx;
    for (let i = 0; i < total; i++) {
      dice[i] = 1 + (rem % config.sides);
      rem = Math.floor(rem / config.sides);
    }
    const att = sortDesc(dice.slice(0, config.attackerDice));
    const def = sortDesc(dice.slice(config.attackerDice));
    counts[judge(att, def).outcome]++;
  }
  const frac = (num: number): ExactFraction => ({ num, den, p: num / den });
  return {
    attackerWinsBoth: frac(counts.attackerWinsBoth),
    split: frac(counts.split),
    defenderWinsBoth: frac(counts.defenderWinsBoth),
  };
}

export const diceDuel: Game<DuelConfig, DuelOutcome, DuelAggregate, DuelExact> = {
  id: 'diceDuel',
  defaultConfig: { attackerDice: 3, defenderDice: 2, sides: 6 },
  simulate: (config, rng) => rollBattle(config, rng).outcome,
  emptyAggregate: () => ({ n: 0, attackerWinsBoth: 0, split: 0, defenderWinsBoth: 0 }),
  accumulate(agg, o) {
    agg.n++;
    agg[o]++;
    return agg;
  },
  exact: exactDuel,
};
