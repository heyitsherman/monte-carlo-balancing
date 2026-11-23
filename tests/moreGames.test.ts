import { describe, expect, test } from 'vitest';
import { runSync } from '../src/core/engine';
import {
  assess,
  BOSS_TARGET,
  FAIR_TARGET,
  HANDICAP_TARGET,
  histPercentile,
  LOOT_TARGET,
  meanCI,
  meanInterval,
  SKILL_TARGET,
  wilson,
} from '../src/core/stats';
import { bestOf, exactBestOf, shortestSeries, type BestOfAggregate, type BestOfConfig } from '../src/games/bestOf';
import { boss, exactBoss, fightBoss, type BossAggregate, type BossConfig, type RoundEvent } from '../src/games/boss';
import { exactLoot, loot, type LootAggregate, type LootConfig } from '../src/games/loot';
import { playTurn, pushLuck, turnExact, type LuckAggregate, type LuckConfig, type Plan, type RollEvent } from '../src/games/pushLuck';
import { exactRace, race } from '../src/games/race';
import { diceDuel, exactDuel } from '../src/games/diceDuel';
import { games } from '../src/games/registry';
import type { AnyGame } from '../src/games/types';
import { createRng } from '../src/core/rng';

const SEED = 'dgt-balance';
const hold = (holdAt: number): Plan => ({ strategy: 'holdAt', holdAt, rolls: 1 });
const rolls = (k: number): Plan => ({ strategy: 'rolls', holdAt: 1, rolls: k });

describe('presets', () => {
  for (const game of Object.values(games) as AnyGame[]) {
    if (!game.presets) continue;
    test(`${game.id}: every preset sets known settings within their ranges`, () => {
      const ids = new Set<string>();
      for (const p of game.presets!) {
        expect(ids.has(p.id), `duplicate ${p.id}`).toBe(false);
        ids.add(p.id);
        expect(p.blurb.length).toBeGreaterThan(10);
        for (const [k, v] of Object.entries(p.config)) {
          expect(k in game.defaultConfig, `${p.id}: unknown key ${k}`).toBe(true);
          const spec = game.params.find((s) => s.key === k);
          expect(spec, `${p.id}: ${k} is not a setting`).toBeTruthy();
          if (spec?.kind === 'int') {
            expect(v as number).toBeGreaterThanOrEqual(spec.min);
            expect(v as number).toBeLessThanOrEqual(spec.max);
          }
        }
      }
    });
  }
});

describe('Push your luck', () => {
  const base = pushLuck.defaultConfig;
  const run = (c: Partial<LuckConfig>, n = 100_000) => runSync<LuckAggregate>('pushLuck', { ...base, ...c }, n, SEED);
  const aRate = (a: LuckAggregate) => a.aWins / a.n;

  test('exact points per turn: banking at 20 (and 21) scores the most, 8.14', () => {
    expect(turnExact(hold(20)).perTurn).toBeCloseTo(8.1418, 3);
    expect(turnExact(hold(21)).perTurn).toBeCloseTo(turnExact(hold(20)).perTurn, 10);
    for (let n = 2; n <= 60; n++) expect(turnExact(hold(n)).perTurn).toBeLessThanOrEqual(turnExact(hold(20)).perTurn + 1e-12);
  });

  test('exact points per turn for a fixed number of rolls: (5/6)^k × 4k', () => {
    for (let k = 1; k <= 10; k++) {
      expect(turnExact(rolls(k)).perTurn).toBeCloseTo((5 / 6) ** k * 4 * k, 10);
      expect(turnExact(rolls(k)).bust).toBeCloseTo(1 - (5 / 6) ** k, 10);
    }
  });

  test('simulated points per turn match the exact answer', () => {
    for (const c of [{ aHoldAt: 10, bHoldAt: 30 }, { aStrategy: 'rolls', aRolls: 3, bHoldAt: 20 }] as Partial<LuckConfig>[]) {
      const agg = run(c);
      const cfg = { ...base, ...c };
      const e = pushLuck.exact!(cfg);
      const a = meanCI(agg.aPtsSum, agg.aPtsSumSq, agg.aTurns);
      const b = meanCI(agg.bPtsSum, agg.bPtsSumSq, agg.bTurns);
      expect(Math.abs(a.mean - e.a.perTurn)).toBeLessThan(2 * a.margin);
      expect(Math.abs(b.mean - e.b.perTurn)).toBeLessThan(2 * b.margin);
      expect(Math.abs(agg.aBusts / agg.aTurns - e.a.bust)).toBeLessThan(0.005);
      expect(agg.capHits).toBe(0);
    }
  });

  test('logged turns match silent turns', () => {
    const events: RollEvent[] = [];
    const a = playTurn(hold(30), createRng('turn'), (e) => events.push(e));
    const b = playTurn(hold(30), createRng('turn'));
    expect(a).toBe(b);
    const last = events[events.length - 1];
    expect(last.bust ? 0 : last.total).toBe(a);
  });

  test('presets do what their blurbs say', () => {
    const p = Object.fromEntries(pushLuck.presets!.map((x) => [x.id, x.config]));
    // careful vs greedy looks balanced (inside the fair band)
    expect(Math.abs(aRate(run(p['careful-vs-greedy'])) - 0.5)).toBeLessThan(FAIR_TARGET.tolerance);
    // banking at 20 beats both, careful by about two games in three
    const vsCareful = aRate(run(p['smart-vs-careful']));
    expect(vsCareful).toBeGreaterThan(0.63);
    expect(vsCareful).toBeLessThan(0.7);
    expect(aRate(run(p['smart-vs-greedy']))).toBeGreaterThan(0.58);
    // three rolls loses clearly
    expect(aRate(run(p['rolls-vs-smart']))).toBeLessThan(0.4);
    // mirror: fair; first move alone: an edge
    expect(Math.abs(aRate(run(p.mirror)) - 0.5)).toBeLessThan(0.01);
    expect(aRate(run(p['first-move']))).toBeGreaterThan(0.52);
  });

  test('the chapter numbers at 10,000 games read as the story says (default seed)', () => {
    const p = Object.fromEntries(pushLuck.presets!.map((x) => [x.id, x.config]));
    const fair = run(p['careful-vs-greedy'], 10_000);
    expect(assess(wilson(fair.aWins, fair.n), FAIR_TARGET).status).toBe('on');
    for (const id of ['smart-vs-careful', 'smart-vs-greedy']) {
      const agg = run(p[id], 10_000);
      expect(assess(wilson(agg.aWins, agg.n), FAIR_TARGET).status).toBe('above');
    }
  });
});

describe('Loot drops', () => {
  const run = (c: Partial<LootConfig>, n = 200_000) => runSync<LootAggregate>('loot', { ...loot.defaultConfig, ...c }, n, SEED);

  test('exact averages: 20 plain, 17.4 with pity at 40, 20.1 at 4% with pity', () => {
    expect(exactLoot({ ...loot.defaultConfig, dropPercent: 5, pity: 0 }).mean).toBeCloseTo(20, 10);
    expect(exactLoot({ ...loot.defaultConfig, dropPercent: 5, pity: 40 }).mean).toBeCloseTo(17.43, 2);
    expect(exactLoot({ ...loot.defaultConfig, dropPercent: 4, pity: 40 }).mean).toBeCloseTo(20.116, 3);
  });

  test('exact distribution sums to 1 and its mean matches the closed form', () => {
    for (const c of [{ dropPercent: 5, pity: 0 }, { dropPercent: 5, pity: 40 }, { dropPercent: 1, pity: 0 }]) {
      const e = exactLoot({ ...loot.defaultConfig, ...c });
      expect(e.dist.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
      expect(e.dist.reduce((s, x, k) => s + x * k, 0)).toBeCloseTo(e.mean, 6);
    }
  });

  test('exact percentiles: 1 player in 100 needs 90 tries or more at 5%', () => {
    const e = exactLoot({ ...loot.defaultConfig, dropPercent: 5, pity: 0 });
    expect(e.median).toBe(14);
    expect(e.p90).toBe(45);
    expect(e.p99).toBe(90);
    // P(T ≥ 90) = 0.95^89, about 1 in 100
    expect(0.95 ** 89).toBeGreaterThan(0.0095);
    expect(0.95 ** 89).toBeLessThan(0.011);
  });

  test('simulation matches the exact average and percentiles', () => {
    for (const c of [{ dropPercent: 5, pity: 0 }, { dropPercent: 5, pity: 40 }, { dropPercent: 4, pity: 40 }]) {
      const agg = run(c);
      const e = exactLoot({ ...loot.defaultConfig, ...c });
      const m = meanCI(agg.sum, agg.sumSq, agg.n);
      expect(Math.abs(m.mean - e.mean)).toBeLessThan(2 * m.margin);
      expect(Math.abs(histPercentile(agg.hist, 0.5) - e.median)).toBeLessThanOrEqual(1);
      expect(Math.abs(histPercentile(agg.hist, 0.99) - e.p99)).toBeLessThanOrEqual(3);
    }
  });

  test('presets do what their blurbs say (target: average 20 ± 1)', () => {
    const p = Object.fromEntries(loot.presets!.map((x) => [x.id, x.config]));
    const status = (agg: LootAggregate) => assess(meanInterval(meanCI(agg.sum, agg.sumSq, agg.n)), LOOT_TARGET).status;
    const plain = run(p.plain, 10_000);
    expect(status(plain)).toBe('on');
    expect(histPercentile(plain.hist, 0.99)).toBeGreaterThanOrEqual(80);
    const pity = run(p.pity, 10_000);
    expect(status(pity)).toBe('below');
    expect(pity.max).toBe(40);
    const tuned = run(p.tuned, 10_000);
    expect(status(tuned)).toBe('on');
    expect(tuned.max).toBe(40);
    expect(exactLoot({ ...loot.defaultConfig, ...p.lower }).p99).toBeGreaterThan(110);
  });
});

describe('Best-of-N', () => {
  const ex = (c: Partial<BestOfConfig>) => exactBestOf({ ...bestOf.defaultConfig, ...c });

  test('exact: best-of-7 gives 60.8%, best-of-45 is the shortest series with 75%', () => {
    expect(ex({ bestOf: 1 }).strongerWin).toBeCloseTo(0.55, 12);
    expect(ex({ bestOf: 7 }).strongerWin).toBeCloseTo(0.6083, 4);
    expect(ex({ bestOf: 43 }).strongerWin).toBeLessThan(0.75);
    expect(ex({ bestOf: 45 }).strongerWin).toBeCloseTo(0.7506, 4);
    expect(shortestSeries(55, 0.75)).toBe(45);
  });

  test('exact series-length distribution sums to 1', () => {
    for (const n of [1, 7, 45]) {
      const e = ex({ bestOf: n });
      expect(e.gamesDist.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    }
  });

  test('simulation matches the exact answers', () => {
    for (const n of [1, 7, 45]) {
      const agg = runSync<BestOfAggregate>('bestOf', { ...bestOf.defaultConfig, bestOf: n }, 200_000, SEED);
      const e = ex({ bestOf: n });
      expect(Math.abs(agg.strongerWins / agg.n - e.strongerWin) * 100).toBeLessThan(0.5);
      expect(Math.abs(agg.gamesSum / agg.n - e.meanGames)).toBeLessThan(0.1);
    }
  });

  test('presets do what their blurbs say', () => {
    const p = Object.fromEntries(bestOf.presets!.map((x) => [x.id, x.config]));
    expect(1 - ex(p['one-game']).strongerWin).toBeCloseTo(0.45, 10);
    expect(ex(p['best-of-7']).strongerWin).toBeGreaterThan(0.6);
    expect(ex(p['best-of-7']).strongerWin).toBeLessThan(0.62);
    expect(ex(p['best-of-45']).strongerWin).toBeGreaterThanOrEqual(0.75);
    expect(ex(p['big-edge']).strongerWin).toBeGreaterThanOrEqual(0.75);
    // best-of-7 misses the skill target clearly at 10,000 series
    const agg = runSync<BestOfAggregate>('bestOf', { ...bestOf.defaultConfig, ...p['best-of-7'] }, 10_000, SEED);
    expect(assess(wilson(agg.strongerWins, agg.n), SKILL_TARGET).status).toBe('below');
  });
});

describe('Boss fight', () => {
  const cfg = (c: Partial<BossConfig>) => ({ ...boss.defaultConfig, ...c });

  test('exact: 32 HP is a fair fight, 28 HP gives 70.4%', () => {
    expect(exactBoss(cfg({ bossHp: 32 })).heroWin).toBeCloseTo(0.487, 3);
    expect(exactBoss(cfg({ bossHp: 28 })).heroWin).toBeCloseTo(0.704, 3);
  });

  test('simulation matches the exact win chance and fight length', () => {
    for (const b of [24, 28, 32]) {
      const agg = runSync<BossAggregate>('boss', cfg({ bossHp: b }), 200_000, SEED);
      const e = exactBoss(cfg({ bossHp: b }));
      expect(Math.abs(agg.heroWins / agg.n - e.heroWin) * 100).toBeLessThan(0.5);
      expect(Math.abs(agg.roundsSum / agg.n - e.meanRounds)).toBeLessThan(0.05);
      expect(agg.capHits).toBe(0);
    }
  });

  test('a logged fight matches a silent one', () => {
    const events: RoundEvent[] = [];
    const a = fightBoss(boss.defaultConfig, createRng('fight'), (e) => events.push(e));
    const b = fightBoss(boss.defaultConfig, createRng('fight'));
    expect(a).toEqual(b);
    expect(events).toHaveLength(a.rounds);
    const last = events[events.length - 1];
    expect(a.heroWins ? last.bossHp : last.heroHp).toBe(0);
  });

  test('presets do what their blurbs say (target: 70% ± 3)', () => {
    const p = Object.fromEntries(boss.presets!.map((x) => [x.id, x.config]));
    const e = (id: string) => exactBoss(cfg(p[id])).heroWin;
    expect(Math.abs(e('fair') - 0.5)).toBeLessThan(FAIR_TARGET.tolerance);
    expect(Math.abs(e('target') - 0.7)).toBeLessThan(0.01);
    expect(e('easy')).toBeGreaterThan(0.85);
    expect(e('easy')).toBeLessThan(0.9);
    expect(e('hard')).toBeLessThan(1 / 3);
    const status = (b: number) => {
      const agg = runSync<BossAggregate>('boss', cfg({ bossHp: b }), 10_000, SEED);
      return assess(wilson(agg.heroWins, agg.n), BOSS_TARGET).status;
    };
    expect(status(32)).toBe('below');
    expect(status(28)).toBe('on');
    expect(status(24)).toBe('above');
  });
});

describe('Handicap', () => {
  test('a 3-square head start gives Player 2 58.67%: on the 58% ± 3 target', () => {
    const e = exactRace({ ...race.defaultConfig, p2HeadStart: 3 });
    expect(e.p2Win).toBeCloseTo(0.5867, 4);
    const point = { p: e.p2Win, lo: e.p2Win, hi: e.p2Win };
    expect(assess(point, HANDICAP_TARGET).status).toBe('on');
    const two = exactRace({ ...race.defaultConfig, p2HeadStart: 2 }).p2Win;
    const four = exactRace({ ...race.defaultConfig, p2HeadStart: 4 }).p2Win;
    expect(assess({ p: two, lo: two, hi: two }, HANDICAP_TARGET).status).toBe('below');
    expect(assess({ p: four, lo: four, hi: four }, HANDICAP_TARGET).status).toBe('above');
  });
});

describe('Dice Duel presets', () => {
  test('presets do what their blurbs say', () => {
    const p = Object.fromEntries(diceDuel.presets!.map((x) => [x.id, x.config]));
    const e = (id: string) => exactDuel({ ...diceDuel.defaultConfig, ...p[id] });
    expect(e('three-two').attackerWinsBoth.p).toBeCloseTo(0.37, 2);
    expect(e('three-two').defenderWinsBoth.p).toBeCloseTo(0.29, 2);
    const two = e('two-two');
    expect(two.defenderWinsBoth.p / two.attackerWinsBoth.p).toBeGreaterThan(1.9);
    expect(two.defenderWinsBoth.p / two.attackerWinsBoth.p).toBeLessThan(2.1);
    expect(e('one-one').attackerWinsBoth).toMatchObject({ num: 15, den: 36 });
  });
});
