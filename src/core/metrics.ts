import type { MetricSpec } from '../games/types';
import { histNormalize, meanCI, wilson, type MeanCI, type Proportion } from './stats';

/** A metric read from an aggregate and turned into something a chart can draw. */
export type MetricEstimate =
  | { kind: 'proportion'; value: Proportion; exact: number | null }
  | { kind: 'mean'; value: MeanCI; exact: number | null }
  | { kind: 'distribution'; /** fractions per value, summing to 1 */ value: number[]; n: number; exact: number[] | null };

/** Read `metric` from `agg` (and its exact answer from `exact`, when there is one). */
export function estimate<A, E>(metric: MetricSpec<A, E>, agg: A, exact?: E | null): MetricEstimate {
  const raw = metric.read(agg);
  const ex = exact != null && metric.exact ? metric.exact(exact) : null;
  switch (raw.kind) {
    case 'proportion':
      return { kind: 'proportion', value: wilson(raw.k, raw.n), exact: typeof ex === 'number' ? ex : null };
    case 'mean':
      return { kind: 'mean', value: meanCI(raw.sum, raw.sumSq, raw.n), exact: typeof ex === 'number' ? ex : null };
    case 'distribution': {
      const n = raw.hist.reduce((s, x) => s + x, 0);
      return { kind: 'distribution', value: histNormalize(raw.hist), n, exact: Array.isArray(ex) ? ex : null };
    }
  }
}
