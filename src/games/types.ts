import type { Rng } from '../core/rng';
import type { Target } from '../core/stats';

/**
 * Every game the demo can simulate implements this interface.
 *
 * - `defaultConfig` holds plain JSON values only (numbers, booleans, strings), so any key
 *   can be swept and every config hashes to a stable RNG stream.
 * - `params` describes the settings a person may change (the Lab builds its controls from
 *   it). Internal settings such as safety caps are simply left out.
 * - `metrics` describes what to read out of an aggregate, so charts and the Lab work for
 *   any game without game-specific UI code.
 * - `simulate` plays ONE game and must be a pure function of (config, rng).
 * - `accumulate` folds one outcome into a cumulative aggregate. It may mutate and return
 *   `agg` (for speed); aggregates must stay structured-cloneable plain data.
 * - `exact`, when present, gives a closed-form / DP answer used as an oracle and overlay.
 *
 * **Bot strategies** are ordinary settings: a `choice` param naming the strategy (e.g.
 * `p1Strategy: 'holdAt'`) plus `int` params for its knobs (e.g. `p1HoldAt: 20`). `simulate`
 * reads them like any other rule, so strategies stay pure, reproducible and sweepable.
 */
export interface Game<C, O, A, E = unknown> {
  id: string;
  defaultConfig: C;
  params: ParamSpec[];
  metrics: MetricSpec<A, E>[];
  simulate(config: C, rng: Rng): O;
  emptyAggregate(): A;
  accumulate(agg: A, o: O): A;
  exact?(config: C): E;
  /**
   * Rule sets that each teach one thing, for the Lab and the worksheet. `blurb` names the lesson in one
   * line and must be true: a test checks that each preset moves the numbers the way its blurb says.
   */
  presets?: Preset<C>[];
}

export interface Preset<C> {
  /** Stable, URL-safe id. */
  id: string;
  /** Short name, e.g. "Pity at 40". */
  label: string;
  /** The lesson in one line. */
  blurb: string;
  /** Changes on top of `defaultConfig`. */
  config: Partial<C>;
}

/** A game with its type parameters erased, for registries and the worker. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = Game<any, any, any, any>;

// ---- settings ---------------------------------------------------------------------

interface ParamBase {
  /** Key in the game's config. */
  key: string;
  /** Short label for a control, e.g. "P2 head start". */
  label: string;
  /** One line explaining the rule, in plain words. */
  help?: string;
}

export type ParamSpec =
  | (ParamBase & { kind: 'int'; min: number; max: number; step?: number; unit?: string })
  | (ParamBase & { kind: 'toggle' })
  | (ParamBase & { kind: 'choice'; options: { value: string; label: string }[] });

// ---- metrics ----------------------------------------------------------------------

/** Raw numbers a metric reads from an aggregate; `core/metrics.ts` turns them into estimates. */
export type MetricValue =
  | { kind: 'proportion'; k: number; n: number }
  | { kind: 'mean'; sum: number; sumSq: number; n: number }
  /** hist[i] = count of games with value i */
  | { kind: 'distribution'; hist: number[] };

interface MetricBase<A, E> {
  id: string;
  /** Plain-words label, e.g. "P1 wins". */
  label: string;
  read(agg: A): MetricValue;
  /** Exact value (proportion or mean) or exact distribution, or null when there is no closed form. */
  exact?(e: E): number | number[] | null;
}

export type MetricSpec<A, E = unknown> =
  | (MetricBase<A, E> & { kind: 'proportion'; /** Default design target, e.g. 50% ± 2 for fairness. */ target?: Target })
  | (MetricBase<A, E> & { kind: 'mean'; unit: string; /** Default design target for the mean. */ target?: Target })
  | (MetricBase<A, E> & { kind: 'distribution'; xLabel: string });
