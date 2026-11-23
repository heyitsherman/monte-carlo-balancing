import { describe, expect, test } from 'vitest';
import { logCheckpoints, runSync, showBatches, stableStringify } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import { estimate } from '../src/core/metrics';
import {
  FAIR_TARGET,
  NOT_ENOUGH_DATA,
  assess,
  formatProportion,
  histAdd,
  meanCI,
  wilson,
  type Proportion,
  type Target,
} from '../src/core/stats';
import { gridIndices, sweep, type RunFn } from '../src/core/sweep';
import type { RaceAggregate } from '../src/games/race';
import { race } from '../src/games/race';

describe('rng', () => {
  test('same seed → same sequence', () => {
    const a = createRng('dgt-balance');
    const b = createRng('dgt-balance');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  test('numeric and string seeds are equivalent', () => {
    const a = createRng(42);
    const b = createRng('42');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  test('different seeds diverge', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-b');
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  test('outputs are in range and roughly uniform', () => {
    const r = createRng('uniform');
    const counts = new Array(6).fill(0);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 60_000; i++) {
      const x = r.next();
      min = Math.min(min, x);
      max = Math.max(max, x);
      counts[r.int(6)]++;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(400);
  });
});

describe('stats', () => {
  test('Wilson CI at p = 0.5, n = 10,000 is ≈ ±0.98 pp', () => {
    const w = wilson(5000, 10_000);
    expect(w.p).toBe(0.5);
    expect(w.marginPP).toBeCloseTo(0.98, 2);
    expect(w.lo).toBeCloseTo(0.4902, 4);
    expect(w.hi).toBeCloseTo(0.5098, 4);
  });

  test('Wilson CI stays inside [0, 1] at the extremes', () => {
    const zero = wilson(0, 10);
    expect(zero.lo).toBe(0);
    expect(zero.hi).toBeGreaterThan(0.2);
    const all = wilson(10, 10);
    expect(all.hi).toBe(1);
    expect(all.lo).toBeLessThan(0.8);
  });

  test('quadrupling n roughly halves the margin', () => {
    const a = wilson(2500, 5000).marginPP;
    const b = wilson(10_000, 20_000).marginPP;
    expect(a / b).toBeCloseTo(2, 1);
  });

  test('n = 0 gives an uninformative interval', () => {
    const w = wilson(0, 0);
    expect(w.lo).toBe(0);
    expect(w.hi).toBe(1);
  });

  test('fairness verdicts at 10,000 games (50% ± 3)', () => {
    expect(assess(wilson(5000, 10_000), FAIR_TARGET).label).toBe('Fair');
    expect(assess(wilson(6180, 10_000), FAIR_TARGET).label).toBe('Favors P1');
    expect(assess(wilson(4160, 10_000), FAIR_TARGET).label).toBe('Favors P2');
    // the race's 2-square head start with the default seed: fair in truth (48.38%), and it reads fair
    expect(assess(wilson(4810, 10_000), FAIR_TARGET).label).toBe('Fair');
  });

  test('formatting', () => {
    expect(formatProportion(wilson(6180, 10_000))).toBe('61.8% ± 1.0 pp (n = 10,000)');
  });

  test('mean CI and histogram helpers', () => {
    const m = meanCI(10 * 5, 10 * 25, 10);
    expect(m.mean).toBe(5);
    expect(m.margin).toBe(0);
    const h: number[] = [];
    histAdd(h, 3);
    histAdd(h, 3);
    expect(h).toEqual([0, 0, 0, 2]);
  });
});

describe('engine', () => {
  test('runs are reproducible from (seed, config)', () => {
    const a = runSync<RaceAggregate>('race', race.defaultConfig, 2000, 'dgt-balance');
    const b = runSync<RaceAggregate>('race', { ...race.defaultConfig }, 2000, 'dgt-balance');
    expect(a).toEqual(b);
  });

  test('config key order does not change the stream', () => {
    const cfg = race.defaultConfig;
    const reordered = Object.fromEntries(Object.entries(cfg).reverse());
    expect(stableStringify(cfg)).toBe(stableStringify(reordered));
  });

  test('show batches and checkpoints', () => {
    expect(showBatches(10_000)).toEqual([1, 10, 100, 1000, 10_000]);
    expect(showBatches(500)).toEqual([1, 10, 100, 500]);
    const cps = logCheckpoints(100_000);
    expect(cps[0]).toBe(1);
    expect(cps[cps.length - 1]).toBe(100_000);
    expect(cps).toContain(10_000);
    expect(new Set(cps).size).toBe(cps.length);
  });
});

describe('sweep', () => {
  const syncRun: RunFn = async <A>(g: string, c: unknown, n: number, s: string) => runSync<A>(g, c, n, s);

  test('grid indices are row-major', () => {
    expect(gridIndices([2, 3])).toEqual([
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
    ]);
  });

  test('1D sweep cells equal standalone runs', async () => {
    const res = await sweep<RaceAggregate>(
      'race', race.defaultConfig, [{ key: 'p2HeadStart', values: [0, 1, 2] }], 1000, 'dgt-balance',
      { runFn: syncRun },
    );
    expect(res.cells).toHaveLength(3);
    const solo = runSync<RaceAggregate>('race', { ...race.defaultConfig, p2HeadStart: 2 }, 1000, 'dgt-balance');
    expect(res.at(2).aggregate).toEqual(solo);
  });

  test('2D sweep (v2 heatmap hook)', async () => {
    const res = await sweep<RaceAggregate>(
      'race', race.defaultConfig,
      [{ key: 'trackLength', values: [15, 20] }, { key: 'p2HeadStart', values: [0, 2, 4] }],
      200, 'x', { runFn: syncRun },
    );
    expect(res.cells).toHaveLength(6);
    expect(res.at(1, 2).config).toMatchObject({ trackLength: 20, p2HeadStart: 4 });
  });

  test('axes can be strategy choices and toggles, not just numbers', async () => {
    const echo: RunFn = async <A>(_g: string, c: unknown) => c as A;
    const res = await sweep<Record<string, unknown>>(
      'race', race.defaultConfig,
      [{ key: 'strategy', values: ['holdAt', 'rollTwice'] }, { key: 'catchUp', values: [false, true] }],
      1, 'x', { runFn: echo },
    );
    expect(res.cells.map((c) => c.coords)).toEqual([
      ['holdAt', false], ['holdAt', true], ['rollTwice', false], ['rollTwice', true],
    ]);
    expect(res.at(1, 1).aggregate).toMatchObject({ strategy: 'rollTwice', catchUp: true });
  });
});

describe('target bands', () => {
  /** A proportion with an exact CI, for readable cases. */
  const ci = (p: number, lo: number, hi: number): Proportion => ({ k: 0, n: 1, p, lo, hi, marginPP: ((hi - lo) / 2) * 100 });
  const boss: Target = { center: 0.7, tolerance: 0.03, labels: { below: 'Too hard', on: 'On target', above: 'Too easy' } };

  test('the fairness band is 50% ± 3 (plan D13)', () => {
    expect(FAIR_TARGET.center - FAIR_TARGET.tolerance).toBeCloseTo(0.47, 12);
    expect(FAIR_TARGET.center + FAIR_TARGET.tolerance).toBeCloseTo(0.53, 12);
  });

  test('whole CI inside the band → on target', () => {
    expect(assess(ci(0.5, 0.49, 0.51), FAIR_TARGET)).toMatchObject({ status: 'on', label: 'Fair' });
    expect(assess(ci(0.481, 0.471, 0.491), FAIR_TARGET).status).toBe('on');
    const a = assess(ci(0.7, 0.68, 0.72), boss);
    expect(a).toMatchObject({ status: 'on', label: 'On target' });
    expect(a.bandLo).toBeCloseTo(0.67, 12);
    expect(a.bandHi).toBeCloseTo(0.73, 12);
  });

  test('whole CI outside the band → named direction', () => {
    expect(assess(ci(0.618, 0.608, 0.628), FAIR_TARGET)).toMatchObject({ status: 'above', label: 'Favors P1' });
    expect(assess(ci(0.45, 0.44, 0.46), FAIR_TARGET)).toMatchObject({ status: 'below', label: 'Favors P2' });
    expect(assess(ci(0.6, 0.59, 0.61), boss).label).toBe('Too hard');
  });

  test('CI crossing a band edge → not enough data', () => {
    // e.g. a reseed puts head start 2 at 47.5% ± 1.0: the range crosses the 47% edge
    expect(assess(ci(0.475, 0.465, 0.485), FAIR_TARGET)).toMatchObject({ status: 'unclear', label: NOT_ENOUGH_DATA });
    // a CI wider than the whole band can't confirm anything
    expect(assess(ci(0.5, 0.4, 0.6), FAIR_TARGET).status).toBe('unclear');
  });

  test('custom unclear label and no data', () => {
    const t: Target = { ...boss, labels: { ...boss.labels, unclear: 'Keep testing' } };
    expect(assess(ci(0.67, 0.66, 0.68), t).label).toBe('Keep testing');
    expect(assess(wilson(0, 0), FAIR_TARGET).status).toBe('unclear');
  });

});

describe('metrics', () => {
  test('estimates read proportions, means and distributions from an aggregate', () => {
    const agg = runSync<RaceAggregate>('race', race.defaultConfig, 2000, 'dgt-balance');
    const e = race.exact!(race.defaultConfig)!;
    const byId = Object.fromEntries(race.metrics.map((m) => [m.id, estimate(m, agg, e)]));
    expect(byId.p1Win).toMatchObject({ kind: 'proportion', exact: e.p1Win });
    if (byId.p1Win.kind === 'proportion') expect(byId.p1Win.value.n).toBe(2000);
    expect(byId.length).toMatchObject({ kind: 'mean', exact: e.meanTurns });
    if (byId.lengthDist.kind === 'distribution') {
      expect(byId.lengthDist.n).toBe(2000);
      expect(byId.lengthDist.value.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    }
  });

  test('no closed form → exact is null', () => {
    const cfg = { ...race.defaultConfig, catchUp: true };
    const agg = runSync<RaceAggregate>('race', cfg, 500, 'x');
    for (const m of race.metrics) expect(estimate(m, agg, race.exact!(cfg)).exact).toBeNull();
  });
});
