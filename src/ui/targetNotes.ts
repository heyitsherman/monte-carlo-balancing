/**
 * Words for the "Not enough data" prompt (plan D13). Written for the room, because the projector shows
 * everything: what the range is, which edge of the target band it crosses, and what to do about it.
 * Pure, so the talk, the Lab and the tests all get the same sentences.
 */
import { type Assessment, type Proportion, formatInt } from '../core/stats';

/** 47.1 → "47.1", 0.47 band edge → "47" (whole percentages without a decimal). */
const pct1 = (x: number) => (x * 100).toFixed(1);
const edge = (x: number) => {
  const v = Math.round(x * 1000) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

/** The range as shown on screen, e.g. "47.1–49.1%". */
export const rangeText = (p: Proportion) => `${pct1(p.lo)}–${pct1(p.hi)}%`;

/** The band, e.g. "47–53%". */
export const bandText = (a: Assessment) => `${edge(a.bandLo)}–${edge(a.bandHi)}%`;

/** Which band edge the range crosses (NaN when it crosses neither or both). */
export function crossedEdge(p: Proportion, a: Assessment): number {
  const lo = p.lo < a.bandLo && p.hi > a.bandLo;
  const hi = p.lo < a.bandHi && p.hi > a.bandHi;
  if (lo && !hi) return a.bandLo;
  if (hi && !lo) return a.bandHi;
  return NaN;
}

/** The prompt shown with "Not enough data: run more". `onWord` is the target's name for on target, e.g. "fair". */
export function unclearPrompt(p: Proportion, a: Assessment, onWord: string): string {
  const e = crossedEdge(p, a);
  if (Number.isFinite(e)) {
    return `Too close to call. The likely range, ${rangeText(p)}, crosses the edge of “${onWord}” at ${edge(e)}%. More games shrink the range.`;
  }
  return `Too close to call. The likely range, ${rangeText(p)}, is wider than the whole “${onWord}” range, ${bandText(a)}. More games shrink the range.`;
}

/** After the extra run settled it, e.g. "Fair. 100,000 games: 48.1–48.7%, inside 47–53%. …" */
export function resolvedLine(p: Proportion, a: Assessment): string {
  const where = a.status === 'on' ? 'inside' : a.status === 'below' ? 'below' : 'above';
  return `${a.label}. ${formatInt(p.n)} games: ${rangeText(p)}, ${where} ${bandText(a)}. It took 10× more games because the answer sits near the edge.`;
}

/** After the extra run, still unclear: stop running and make a design decision instead. */
export function stillUnclearLine(onWord: string): string {
  return `Still too close to call. The true value is right at the edge of your “${onWord}” range, so players won’t feel a difference either way. Widen the range, or nudge the rule.`;
}
