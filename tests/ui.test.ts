import { describe, expect, test } from 'vitest';
import { runSync } from '../src/core/engine';
import {
  BOSS_TARGET,
  FAIR_TARGET,
  LOOT_TARGET,
  SKILL_TARGET,
  assess,
  histPercentile,
  meanInterval,
  wilson,
  type Proportion,
} from '../src/core/stats';
import { waitShares, waitYMax } from '../src/ui/charts/waitChart';
import { matchPromptVariants } from '../src/ui/match';
import { race, type RaceAggregate } from '../src/games/race';
import { addingLabel, playBuildUp, replayLabel } from '../src/ui/buildUp';
import { groupCall, playtestGroups } from '../src/ui/chapters/playtests';
import { crossedEdge, resolvedLine, stillUnclearLine, unclearPrompt } from '../src/ui/targetNotes';
import { parseHash, parsePlaylist, playlistUrl } from '../src/ui/playlist';
import type { AppContext } from '../src/ui/types';

const LIB = ['title', 'duel', 'race', 'closing'];
const DEFAULT = ['title', 'duel', 'race', 'closing'];

describe('playlists', () => {
  test('no ?set= → the default talk', () => {
    expect(parsePlaylist('', LIB, DEFAULT)).toEqual({ ids: DEFAULT, unknown: [] });
    expect(parsePlaylist('?seed=x', LIB, DEFAULT).ids).toEqual(DEFAULT);
  });

  test('?set= picks chapters in the given order, case-insensitive, without duplicates', () => {
    expect(parsePlaylist('?set=race,duel', LIB, DEFAULT).ids).toEqual(['race', 'duel']);
    expect(parsePlaylist('?set=RACE, duel ,race', LIB, DEFAULT).ids).toEqual(['race', 'duel']);
  });

  test('unknown ids are reported and skipped; nothing valid → default', () => {
    expect(parsePlaylist('?set=duel,pig', LIB, DEFAULT)).toEqual({ ids: ['duel'], unknown: ['pig'] });
    expect(parsePlaylist('?set=pig', LIB, DEFAULT)).toEqual({ ids: DEFAULT, unknown: ['pig'] });
  });

  test('session link', () => {
    expect(playlistUrl('https://x.test/mcb/', ['duel', 'race'])).toBe('https://x.test/mcb/?set=duel,race');
  });
});

describe('deep links', () => {
  const ids = ['title', 'duel', 'race', 'closing'];
  const steps = [1, 7, 6, 1];

  test('by position (v1 links keep working) and by id', () => {
    expect(parseHash('#3.4', ids, steps)).toEqual({ chapter: 2, step: 3 });
    expect(parseHash('#race.4', ids, steps)).toEqual({ chapter: 2, step: 3 });
    expect(parseHash('#duel', ids, steps)).toEqual({ chapter: 1, step: 0 });
  });

  test('clamps out-of-range numbers', () => {
    expect(parseHash('#9.99', ids, steps)).toEqual({ chapter: 3, step: 0 });
    expect(parseHash('#race.99', ids, steps)).toEqual({ chapter: 2, step: 5 });
    expect(parseHash('#0.0', ids, steps)).toEqual({ chapter: 0, step: 0 });
  });

  test('not a deep link, or a chapter outside this session → null', () => {
    expect(parseHash('', ids, steps)).toBeNull();
    expect(parseHash('#top', ids, steps)).toBeNull();
    expect(parseHash('#race.4', ['title', 'duel'], [1, 7])).toBeNull();
  });

  test('positions count within the session', () => {
    expect(parseHash('#2.3', ['race', 'duel'], [6, 7])).toEqual({ chapter: 1, step: 2 });
  });
});

describe('build-up', () => {
  const noun = { one: 'game', many: 'games' };

  test('labels say these are replays of games already played', () => {
    expect(replayLabel(1, noun)).toBe('Replaying the first game');
    expect(replayLabel(10_000, noun)).toBe('Replaying the first 10,000 games');
  });

  /** A context whose clock is instant and whose epoch can be bumped mid-run. */
  function fakeCtx() {
    let epoch = 1;
    const labels: (string | null)[] = [];
    const ctx = {
      get epoch() {
        return epoch;
      },
      alive: (e: number) => e === epoch,
      wait: async (_ms: number, e: number) => e === epoch,
      setReplay: (t: string | null) => labels.push(t),
    } as unknown as AppContext;
    return { ctx, labels, bump: () => epoch++ };
  }

  test('shows every frame, labels all but the last, then clears the label', async () => {
    const { ctx, labels } = fakeCtx();
    const shown: number[] = [];
    const frames = [1, 10, 100].map((n) => ({ n, data: n }));
    const done = await playBuildUp(ctx, 1, frames, (d) => shown.push(d), { noun });
    expect(done).toBe(true);
    expect(shown).toEqual([1, 10, 100]);
    expect(labels).toEqual(['Replaying the first game', 'Replaying the first 10 games', null]);
  });

  test('stops when the presenter moves on', async () => {
    const { ctx, bump } = fakeCtx();
    const shown: number[] = [];
    const frames = [1, 10, 100].map((n) => ({ n, data: n }));
    const done = await playBuildUp(ctx, 1, frames, (d) => {
      shown.push(d);
      if (d === 10) bump();
    }, { noun });
    expect(done).toBe(false);
    expect(shown).toEqual([1, 10]);
  });
});

describe('"Not enough data" prompt (D13)', () => {
  const prop = (p: number, lo: number, hi: number, n = 10_000): Proportion => ({ k: 0, n, p, lo, hi, marginPP: 0 });

  test('names the range and the edge it crosses', () => {
    const p = prop(0.475, 0.465, 0.485);
    const a = assess(p, FAIR_TARGET);
    expect(crossedEdge(p, a)).toBeCloseTo(0.47, 12);
    expect(unclearPrompt(p, a, 'fair')).toBe(
      'Too close to call. The likely range, 46.5–48.5%, crosses the edge of “fair” at 47%. More games shrink the range.',
    );
  });

  test('a range wider than the whole band says so', () => {
    const p = prop(0.5, 0.44, 0.56);
    const a = assess(p, FAIR_TARGET);
    expect(crossedEdge(p, a)).toBeNaN();
    expect(unclearPrompt(p, a, 'fair')).toContain('is wider than the whole “fair” range, 47–53%');
  });

  test('after the extra run', () => {
    const p = prop(0.484, 0.481, 0.487, 100_000);
    expect(resolvedLine(p, assess(p, FAIR_TARGET))).toBe(
      'Fair. 100,000 games: 48.1–48.7%, inside 47–53%. It took 10× more games because the answer sits near the edge.',
    );
    expect(stillUnclearLine('fair')).toContain('Widen the range, or nudge the rule.');
  });

  test('extending a run is labelled as adding games', () => {
    expect(addingLabel(50_000, 100_000, { one: 'game', many: 'games' })).toBe('Adding games: 50,000 of 100,000');
  });
});

describe('ten playtests', () => {
  test('a group calls it for whoever won more; 5–5 looks fair', () => {
    expect(groupCall(6, 10)).toBe('p1');
    expect(groupCall(5, 10)).toBe('tie');
    expect(groupCall(4, 10)).toBe('p2');
  });

  test('the groups play the first 200 games of the race run for the same seed', () => {
    const groups = playtestGroups('dgt-balance');
    expect(groups).toHaveLength(20);
    expect(groups.every((g) => g.winners.length === 10)).toBe(true);
    const first200 = runSync<RaceAggregate>('race', race.defaultConfig, 200, 'dgt-balance');
    expect(groups.reduce((s, g) => s + g.p1Wins, 0)).toBe(first200.p1Wins);
    expect(playtestGroups('dgt-balance')).toEqual(groups);
  });

  test('the truth behind them reads "Favors P1"', () => {
    const agg = runSync<RaceAggregate>('race', race.defaultConfig, 10_000, 'dgt-balance');
    expect(assess(wilson(agg.p1Wins, agg.n), FAIR_TARGET).label).toBe('Favors P1');
  });
});

describe('Phase 4 helpers', () => {
  const prop = (p: number, lo: number, hi: number, n = 10_000): Proportion => ({ k: 0, n, p, lo, hi, marginPP: 0 });

  test('prompts name what was simulated', () => {
    const p = prop(0.745, 0.737, 0.754);
    const a = assess(p, SKILL_TARGET);
    expect(a.status).toBe('unclear');
    expect(unclearPrompt(p, a, 'skill wins', 'series')).toBe(
      'Too close to call. The likely range, 73.7–75.4%, crosses the edge of “skill wins” at 75%. More series shrink the range.',
    );
    const settled = prop(0.704, 0.701, 0.707, 100_000);
    expect(resolvedLine(settled, assess(settled, BOSS_TARGET), 'fights')).toBe(
      'On target. 100,000 fights: 70.1–70.7%, inside 67–73%. It took 10× more fights because the answer sits near the edge.',
    );
  });

  test('every prompt variant is reserved, with the run-more button label', () => {
    const v = matchPromptVariants(BOSS_TARGET, 'on target', 'fights');
    expect(v).toHaveLength(6);
    expect(v[0]).toContain('Run 100,000 fights (N)');
    for (const label of ['Too hard', 'On target', 'Too easy']) expect(v.some((s) => s.startsWith(`${label}. 100,000 fights`))).toBe(true);
  });

  test('a mean can be assessed against a target band', () => {
    const tuned = meanInterval({ mean: 20.17, margin: 0.27, n: 10_000 });
    expect(assess(tuned, LOOT_TARGET).status).toBe('on');
    expect(assess(meanInterval({ mean: 17.2, margin: 0.25, n: 10_000 }), LOOT_TARGET).label).toBe('Too generous');
  });

  test('wait chart shares: padded to the axis, with the tail counted', () => {
    const { shares, over } = waitShares([0, 5, 3, 0, 2], 3);
    expect(shares).toEqual([0, 0.5, 0.3, 0]);
    expect(over).toBeCloseTo(0.2, 12);
    // the pity try's spike is left out of the axis
    expect(waitYMax([[0, 0.05, 0.04, 0.2]], 3)).toBeCloseTo(0.05, 12);
    expect(waitYMax([[0, 0.051, 0.04, 0.2]], 3)).toBeCloseTo(0.06, 12);
  });

  test('percentiles: the unluckiest 1 in 100', () => {
    const hist = [0, 50, 30, 10, 9, 1];
    expect(histPercentile(hist, 0.5)).toBe(1);
    expect(histPercentile(hist, 0.9)).toBe(3);
    expect(histPercentile(hist, 0.99)).toBe(4);
    expect(histPercentile([], 0.5)).toBeNaN();
  });
});
