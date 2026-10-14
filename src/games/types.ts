import type { Rng } from '../core/rng';

/**
 * Every game the demo can simulate implements this interface.
 *
 * - `defaultConfig` holds plain JSON numbers/booleans only, so any numeric key can be swept.
 * - `simulate` plays ONE game and must be a pure function of (config, rng).
 * - `accumulate` folds one outcome into a cumulative aggregate. It may mutate and return
 *   `agg` (for speed); aggregates must stay structured-cloneable plain data.
 * - `exact`, when present, gives a closed-form / DP answer used as an oracle and overlay.
 */
export interface Game<C, O, A, E = unknown> {
  id: string;
  defaultConfig: C;
  simulate(config: C, rng: Rng): O;
  emptyAggregate(): A;
  accumulate(agg: A, o: O): A;
  exact?(config: C): E;
}

/** A game with its type parameters erased, for registries and the worker. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = Game<any, any, any, any>;
