import { getGame } from '../games/registry';
import type { AnyGame } from '../games/types';
import { createRng, type Rng } from './rng';

/** JSON with sorted keys, so equal configs always produce equal strings. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/**
 * The RNG stream for a run is derived from (seed, game, config). Consequences:
 * - Show mode and Fast mode produce identical final numbers.
 * - Returning to a config reproduces its numbers exactly (rehearsable).
 * - A sweep cell equals the standalone run of the same config.
 */
export function runRng(seed: string, gameId: string, config: unknown): Rng {
  return createRng(`${seed}|${gameId}|${stableStringify(config)}`);
}

/** Play `n` games into `agg`. Shared by the worker and the tests. */
export function simulateInto<A>(game: AnyGame, config: unknown, n: number, rng: Rng, agg: A): A {
  for (let i = 0; i < n; i++) agg = game.accumulate(agg, game.simulate(config, rng));
  return agg;
}

/** Synchronous equivalent of `runner.run` (no worker). For tests and Node scripts. */
export function runSync<A = unknown>(gameId: string, config: unknown, n: number, seed: string): A {
  const game = getGame(gameId);
  return simulateInto(game, config, n, runRng(seed, gameId, config), game.emptyAggregate()) as A;
}

/** Cumulative batch sizes used by Show mode: 1, 10, 100, ... up to n (n always included). */
export function showBatches(n: number): number[] {
  const out: number[] = [];
  for (let b = 1; b < n; b *= 10) out.push(b);
  out.push(n);
  return out;
}

/** ~perDecade log-spaced integer checkpoints from 1 to n (inclusive, deduplicated). */
export function logCheckpoints(n: number, perDecade = 24): number[] {
  const set = new Set<number>();
  const steps = Math.ceil(Math.log10(n) * perDecade);
  for (let i = 0; i <= steps; i++) set.add(Math.min(n, Math.round(10 ** (i / perDecade))));
  for (const b of showBatches(n)) set.add(b);
  return [...set].sort((a, b) => a - b);
}
