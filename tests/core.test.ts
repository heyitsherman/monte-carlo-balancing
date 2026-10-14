import { describe, expect, test } from 'vitest';
import { logCheckpoints, runSync, showBatches, stableStringify } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import { histAdd, meanCI, verdict, wilson, formatProportion } from '../src/core/stats';
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

  test('verdict', () => {
    expect(verdict(wilson(5000, 10_000))).toBe('Fair within margin');
    expect(verdict(wilson(6180, 10_000))).toBe('Favors P1');
    expect(verdict(wilson(4800, 10_000))).toBe('Favors P2');
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
});
