import { describe, expect, test } from 'vitest';
import { playBuildUp, replayLabel } from '../src/ui/buildUp';
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
