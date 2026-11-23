import { formatInt } from '../core/stats';
import { sound } from './audio';
import type { AppContext } from './types';

/**
 * The one animation rule (plan D8), shared by every chapter and, later, the Lab:
 * - an explicit run (entering a run step, or R) plays the paced build-up 1 → 10 → … → N;
 * - a tweak (slider, toggle) updates instantly;
 * - a build-up replays results that are already computed, and says so on screen, so nobody
 *   mistakes the pacing for the computer being slow or for the simulation itself.
 */

export interface BuildUpFrame<T> {
  /** Games played so far in this frame. */
  n: number;
  data: T;
}

export interface BuildUpOptions {
  /** e.g. { one: 'game', many: 'games' } */
  noun: { one: string; many: string };
  /** Tween into each frame (ms). */
  tweenMs?: number;
  /** Pause on each frame before the next (ms). */
  holdMs?: number;
  /** Extra liveness check (e.g. a control changed mid-replay). */
  alive?: () => boolean;
  /** Label for a frame, when "Replaying the first N …" isn't what is happening. */
  label?: (n: number) => string;
}

/** Label for extending a run, e.g. "Adding games: 50,000 of 100,000". */
export function addingLabel(n: number, total: number, noun: BuildUpOptions['noun']): string {
  return `Adding ${noun.many}: ${formatInt(n)} of ${formatInt(total)}`;
}

export function replayLabel(n: number, noun: BuildUpOptions['noun']): string {
  return n === 1 ? `Replaying the first ${noun.one}` : `Replaying the first ${formatInt(n)} ${noun.many}`;
}

/**
 * Show `frames` one after another. Resolves true when the last frame is on screen,
 * false when the presenter moved on (the caller should then stop).
 */
export async function playBuildUp<T>(
  ctx: AppContext,
  epoch: number,
  frames: BuildUpFrame<T>[],
  show: (data: T, ms: number) => unknown,
  opts: BuildUpOptions,
): Promise<boolean> {
  const tweenMs = opts.tweenMs ?? 500;
  const holdMs = opts.holdMs ?? 900;
  const live = () => ctx.alive(epoch) && (opts.alive?.() ?? true);
  sound.runStart();
  for (let i = 0; i < frames.length; i++) {
    if (!live()) return false;
    const last = i === frames.length - 1;
    ctx.setReplay(last ? null : (opts.label ?? ((n) => replayLabel(n, opts.noun)))(frames[i].n));
    if (!last) sound.tick();
    await show(frames[i].data, tweenMs);
    if (!last && !((await ctx.wait(holdMs, epoch)) && live())) return false;
  }
  return live();
}
