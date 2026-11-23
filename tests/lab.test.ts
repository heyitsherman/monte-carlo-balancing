import { describe, expect, test } from 'vitest';
import { wilson } from '../src/core/stats';
import { games } from '../src/games/registry';
import type { AnyGame } from '../src/games/types';
import {
  decodeLab,
  defaultState,
  differences,
  encodeLab,
  isRelevant,
  LAB_GAMES,
  labUrl,
  sweepValues,
  validValue,
  valueLabel,
} from '../src/lab/labState';
import { detectable, diffMean, diffProportion, proportionSd, runsToDetect, toCsv } from '../src/lab/labStats';

describe('Lab state and its URL', () => {
  test('every registered game is in the Lab picker', () => {
    expect(LAB_GAMES.map((g) => g.id).sort()).toEqual(Object.keys(games).sort());
  });

  test('defaults encode to a short link and decode back', () => {
    const s = defaultState('race');
    expect(encodeLab(s)).toBe('lab&game=race');
    expect(decodeLab(`?${encodeLab(s)}`)).toEqual(s);
  });

  test('a full state round-trips through the URL', () => {
    const s = defaultState('pushLuck');
    s.a = { ...s.a, aHoldAt: 20, firstPlayer: 'a' };
    s.b = { ...s.a, bStrategy: 'rolls', bRolls: 4 };
    s.n = 100_000;
    s.seed = 'maple-123';
    s.view = 'sweep';
    s.metric = 'aPerTurn';
    s.sweepX = 'aHoldAt';
    s.sweepY = 'bHoldAt';
    const url = encodeLab(s);
    expect(url).toContain('a.aHoldAt=20');
    expect(url).toContain('&b&');
    expect(url).toContain('b.bRolls=4');
    expect(decodeLab(`?${url}`)).toEqual(s);
  });

  test('every game round-trips with every setting changed', () => {
    for (const g of Object.values(games) as AnyGame[]) {
      const s = defaultState(g.id);
      for (const p of g.params) {
        if (p.kind === 'int') s.a[p.key] = p.max;
        else if (p.kind === 'toggle') s.a[p.key] = !s.a[p.key];
        else s.a[p.key] = p.options[p.options.length - 1].value;
      }
      expect(decodeLab(`?${encodeLab(s)}`), g.id).toEqual(s);
    }
  });

  test('invalid values fall back or are made valid', () => {
    const s = decodeLab('?lab&game=race&a.p2HeadStart=99&a.catchUp=maybe&a.dieSides=7&n=5&seed=<x>&metric=nope&x=nope');
    expect(s.a.p2HeadStart).toBe(6); // clamped
    expect(s.a.catchUp).toBe(false); // fallback
    expect(s.a.dieSides).toBe(8); // snapped to the step (4, 6, 8, …)
    expect(s.n).toBe(10_000);
    expect(s.seed).toBe('dgt-balance');
    expect(s.metric).toBe('p1Win');
    expect(s.sweepX).toBe('trackLength');
    expect(decodeLab('?lab&game=chess').game).toBe('race');
  });

  test('internal settings (safety caps) are kept and never set from the URL', () => {
    const s = decodeLab('?lab&game=race&a.maxTurns=3');
    expect(s.a.maxTurns).toBe(1000);
  });

  test('"Open in Lab" links carry the rules and the seed', () => {
    const url = labUrl('https://x.test/app/', 'race', { ...games.race.defaultConfig, p2HeadStart: 3 }, 'maple-123');
    expect(url).toBe('https://x.test/app/?lab&game=race&a.p2HeadStart=3&seed=maple-123');
    const s = decodeLab(url.slice(url.indexOf('?')));
    expect(s.a.p2HeadStart).toBe(3);
    expect(s.seed).toBe('maple-123');
  });

  test('settings that depend on another setting', () => {
    const p = games.pushLuck.params.find((x) => x.key === 'aRolls')!;
    expect(isRelevant(p, games.pushLuck.defaultConfig as unknown as Record<string, unknown>)).toBe(false);
    expect(isRelevant(p, { ...games.pushLuck.defaultConfig, aStrategy: 'rolls' })).toBe(true);
  });

  test('differences, sweep values and labels', () => {
    const g = games.race as AnyGame;
    expect(differences(g, g.defaultConfig, { ...g.defaultConfig, catchUp: true }).map((p) => p.key)).toEqual(['catchUp']);
    const hs = g.params.find((p) => p.key === 'p2HeadStart')!;
    expect(sweepValues(hs)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const bo = games.bestOf.params.find((p) => p.key === 'bestOf')!;
    const v = sweepValues(bo) as number[];
    expect(v.length).toBeLessThanOrEqual(13);
    expect(v[0]).toBe(1);
    expect(v[v.length - 1]).toBe(99);
    expect(v.every((x) => x % 2 === 1)).toBe(true);
    expect(sweepValues(g.params.find((p) => p.key === 'catchUp')!)).toEqual([false, true]);
    expect(valueLabel(g.params.find((p) => p.key === 'catchUp')!, true)).toBe('On');
    expect(validValue(hs, 2.4, 0)).toBe(2);
  });
});

describe('Lab statistics', () => {
  test('difference of two proportions: Newcombe interval around B − A', () => {
    const a = wilson(6189, 10_000);
    const b = wilson(5530, 10_000);
    const d = diffProportion(a, b);
    expect(d.d).toBeCloseTo(-0.0659, 4);
    expect(d.lo).toBeLessThan(d.d);
    expect(d.hi).toBeGreaterThan(d.d);
    expect(d.hi - d.lo).toBeGreaterThan(0.02);
    expect(d.hi - d.lo).toBeLessThan(0.03);
    expect(detectable(d)).toBe(true);
    expect(detectable(diffProportion(wilson(5000, 10_000), wilson(5050, 10_000)))).toBe(false);
  });

  test('difference of two means: margins add in quadrature', () => {
    const d = diffMean({ mean: 20, margin: 0.3, n: 1 }, { mean: 17.4, margin: 0.4, n: 1 });
    expect(d.d).toBeCloseTo(-2.6, 12);
    expect(d.hi - d.d).toBeCloseTo(0.5, 12);
  });

  test('runs to detect an edge: a 2 pp edge near 50% needs about 2,400 runs', () => {
    expect(runsToDetect(0.02, proportionSd(0.5))).toBe(2401);
    expect(runsToDetect(0.01, proportionSd(0.5))).toBe(9604);
    expect(runsToDetect(0, 0.5)).toBeNaN();
    expect(proportionSd(NaN)).toBe(0.5);
  });

  test('CSV quoting', () => {
    expect(toCsv([['a', 'b,c'], [1, 'say "hi"'], [NaN, null]])).toBe('a,"b,c"\r\n1,"say ""hi"""\r\n,\r\n');
  });
});
