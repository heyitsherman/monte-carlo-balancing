import { describe, expect, test } from 'vitest';
import { runSync } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import { wilson } from '../src/core/stats';
import { DUEL_OUTCOMES, diceDuel, exactDuel, rollBattle, type DuelAggregate } from '../src/games/diceDuel';
import { exactRace, playRace, race, type RaceAggregate, type RaceConfig, type RaceEvent } from '../src/games/race';
import { games } from '../src/games/registry';

const SEED = 'dgt-balance';

describe('settings and metrics descriptions', () => {
  for (const game of Object.values(games)) {
    test(`${game.id}: every param matches defaultConfig and its range`, () => {
      const cfg = game.defaultConfig as unknown as Record<string, unknown>;
      const keys = new Set<string>();
      for (const p of game.params) {
        expect(keys.has(p.key), `duplicate ${p.key}`).toBe(false);
        keys.add(p.key);
        expect(p.key in cfg, `${p.key} missing from defaultConfig`).toBe(true);
        const v = cfg[p.key];
        if (p.kind === 'int') {
          expect(Number.isInteger(v)).toBe(true);
          expect(v as number).toBeGreaterThanOrEqual(p.min);
          expect(v as number).toBeLessThanOrEqual(p.max);
          expect(((v as number) - p.min) % (p.step ?? 1)).toBe(0);
        } else if (p.kind === 'toggle') {
          expect(typeof v).toBe('boolean');
        } else {
          expect(p.options.map((o) => o.value)).toContain(v);
        }
      }
    });

    test(`${game.id}: metrics have unique ids and read the default run`, () => {
      const ids = game.metrics.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      const agg = runSync<never>(game.id, game.defaultConfig, 200, SEED);
      for (const m of game.metrics) expect(m.read(agg).kind).toBe(m.kind);
    });
  }
});

describe('Dice Duel', () => {
  test('exact() enumerates 7,776 outcomes: 2890 / 2611 / 2275', () => {
    const e = exactDuel(diceDuel.defaultConfig);
    expect(e.attackerWinsBoth).toMatchObject({ num: 2890, den: 7776 });
    expect(e.split).toMatchObject({ num: 2611, den: 7776 });
    expect(e.defenderWinsBoth).toMatchObject({ num: 2275, den: 7776 });
  });

  test('ties go to the defender', () => {
    // Force every die to show the same face: rng always returns 0.5 → face 4.
    const rng = { next: () => 0.5, int: (n: number) => Math.floor(0.5 * n) };
    const b = rollBattle(diceDuel.defaultConfig, rng);
    expect(b.attacker).toEqual([4, 4, 4]);
    expect(b.defender).toEqual([4, 4]);
    expect(b.outcome).toBe('defenderWinsBoth');
  });

  test('simulation at n = 1,000,000 is within 0.3 pp of exact', () => {
    const agg = runSync<DuelAggregate>('diceDuel', diceDuel.defaultConfig, 1_000_000, SEED);
    const e = exactDuel(diceDuel.defaultConfig);
    expect(agg.n).toBe(1_000_000);
    for (const o of DUEL_OUTCOMES) {
      expect(Math.abs(agg[o] / agg.n - e[o].p) * 100).toBeLessThan(0.3);
    }
  });
});

describe('Race', () => {
  const base = race.defaultConfig;
  const configs: Record<string, RaceConfig> = {
    baseline: base,
    'head start 2': { ...base, p2HeadStart: 2 },
    'first-roll bonus': { ...base, p2FirstRollBonus: 1 },
    'first-roll bonus 3, short track, d8': { ...base, p2FirstRollBonus: 3, trackLength: 12, dieSides: 8 },
  };

  for (const [name, cfg] of Object.entries(configs)) {
    test(`exact() vs simulation at n = 200,000 within 0.5 pp: ${name}`, () => {
      const agg = runSync<RaceAggregate>('race', cfg, 200_000, SEED);
      const e = exactRace(cfg);
      expect(Math.abs(agg.p1Wins / agg.n - e.p1Win) * 100).toBeLessThan(0.5);
      expect(agg.capHits).toBe(0);
    });
  }

  test('exact() distribution of game length is consistent', () => {
    const e = exactRace(base);
    const total = e.lengthDist.reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(1, 10);
    const agg = runSync<RaceAggregate>('race', base, 100_000, SEED);
    expect(Math.abs(agg.turnsSum / agg.n - e.meanTurns)).toBeLessThan(0.1);
  });

  test('baseline P1 win rate is in the calibrated 57–65% band', () => {
    const e = exactRace(base);
    expect(e.p1Win).toBeGreaterThan(0.57);
    expect(e.p1Win).toBeLessThan(0.65);
    const agg = runSync<RaceAggregate>('race', base, 10_000, SEED);
    const w = wilson(agg.p1Wins, agg.n);
    expect(w.p).toBeGreaterThan(0.57);
    expect(w.p).toBeLessThan(0.65);
    expect(w.lo).toBeGreaterThan(0.5); // clearly outside the CI at n = 10,000
  });

  test('maxTurns is never hit in any demo config', () => {
    const variants: Partial<RaceConfig>[] = [
      {}, { catchUp: true }, { p2FirstRollBonus: 1 }, { p2FirstRollBonus: 1, catchUp: true },
      ...[0, 1, 2, 3, 4, 5, 6].map((h) => ({ p2HeadStart: h })),
      ...[0, 3, 6].map((h) => ({ p2HeadStart: h, catchUp: true })),
    ];
    for (const v of variants) {
      const agg = runSync<RaceAggregate>('race', { ...base, ...v }, 20_000, SEED);
      expect(agg.capHits).toBe(0);
    }
  });

  test('catch-up pulls the game toward fair', () => {
    const agg = runSync<RaceAggregate>('race', { ...base, catchUp: true }, 50_000, SEED);
    const e = exactRace(base);
    expect(Math.abs(agg.p1Wins / agg.n - 0.5)).toBeLessThan(Math.abs(e.p1Win - 0.5));
  });

  test('logged play matches silent play', () => {
    const events: RaceEvent[] = [];
    const a = playRace({ ...base, catchUp: true }, createRng('log'), (e) => events.push(e));
    const b = playRace({ ...base, catchUp: true }, createRng('log'));
    expect(a).toEqual(b);
    expect(events).toHaveLength(a.turns);
    expect(events[0].player).toBe(1);
  });
});
