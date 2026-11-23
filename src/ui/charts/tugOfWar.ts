import { fontScale, hWhisker, line, linear, svgOpen, text } from './svg';

export interface TugData {
  /** P1 win proportion and its 95% CI */
  p: number;
  lo: number;
  hi: number;
  /** exact P1 win probability, NaN when there is no closed form */
  exact: number;
  /** a reference P1 rate to compare against (e.g. baseline), NaN for none */
  ghost: number;
  /** The target band for P1's share, e.g. 0.47–0.53, and its name ("Fair"). */
  bandLo: number;
  bandHi: number;
  bandName: string;
  /** The band edge the CI crosses ("not enough data"), highlighted; NaN for none. */
  crossed: number;
  /** Names inside the bar (default "P1" and "P2"). */
  leftName?: string;
  rightName?: string;
  /** Band caption (default "<bandName>: lo–hi%"), e.g. when the target is about the right-hand side. */
  bandText?: string;
}

const pctEdge = (x: number) => `${Math.round(x * 1000) / 10}`;

/**
 * Horizontal "tug of war" bar: P1's share in blue from the left, P2's in orange from the right.
 * The 50% fair line, the CI whisker at the boundary, the exact value and the baseline are overlaid.
 */
export function renderTug(d: TugData, w: number, h: number): string {
  const fs = fontScale();
  const m = { l: 20 * fs, r: 20 * fs };
  const barTop = 44 * fs;
  const barH = Math.max(40, Math.min(110 * fs, h - barTop - 70 * fs));
  const barBot = barTop + barH;
  const x = linear(0, 1, m.l, w - m.r);
  let s = svgOpen(w, h, 'Share of games won by Player 1 versus Player 2, with 95% confidence interval');
  // The target band shows above and below the bar; its edges run through it.
  s += `<rect x="${x(d.bandLo)}" y="${barTop - 14 * fs}" width="${x(d.bandHi) - x(d.bandLo)}" height="${barH + 28 * fs}" class="target-band"/>`;
  if (Number.isFinite(d.p)) {
    const bx = x(d.p);
    s += `<rect x="${x(0)}" y="${barTop}" width="${bx - x(0)}" height="${barH}" fill="var(--p1)" class="tug"/>`;
    s += `<rect x="${bx}" y="${barTop}" width="${x(1) - bx}" height="${barH}" fill="var(--p2)" class="tug"/>`;
    s += text(x(0) + 20 * fs, barTop + barH / 2 + 12 * fs, d.leftName ?? 'P1', 'tug-label tug-label--p1', 'start');
    s += text(x(1) - 20 * fs, barTop + barH / 2 + 12 * fs, d.rightName ?? 'P2', 'tug-label tug-label--p2', 'end');
    // CI whisker straddling the boundary
    s += hWhisker(x(d.lo), x(d.hi), barTop + barH / 2, barH * 0.3);
  } else {
    s += `<rect x="${x(0)}" y="${barTop}" width="${x(1) - x(0)}" height="${barH}" class="tug-empty"/>`;
  }
  for (const e of [d.bandLo, d.bandHi]) {
    s += line(x(e), barTop - 14 * fs, x(e), barBot + 14 * fs, e === d.crossed ? 'band-edge crossed' : 'band-edge');
  }
  // Keep the caption inside the chart when the band sits at an end (e.g. 75–100%).
  const mid = x((d.bandLo + d.bandHi) / 2);
  const caption = d.bandText ?? `${d.bandName}: ${pctEdge(d.bandLo)}–${pctEdge(d.bandHi)}%`;
  const half = caption.length * 5.5 * fs;
  s += text(Math.min(Math.max(mid, m.l + half), w - m.r - half), barTop - 22 * fs, caption, 'fair-label');
  if (Number.isFinite(d.crossed)) {
    s += text(x(d.crossed), barBot + 50 * fs, `${pctEdge(d.crossed)}%`, 'crossed-label');
  }
  if (Number.isFinite(d.exact)) {
    s += line(x(d.exact), barTop - 6 * fs, x(d.exact), barBot + 6 * fs, 'exact');
  }
  if (Number.isFinite(d.ghost)) {
    s += line(x(d.ghost), barBot + 4 * fs, x(d.ghost), barBot + 26 * fs, 'ghost');
    s += text(x(d.ghost), barBot + 50 * fs, 'baseline', 'ghost-label');
  }
  for (const v of [0, 0.25, 0.75, 1]) {
    // Skip a middle tick that would collide with the "baseline" label.
    if (v > 0 && v < 1 && Number.isFinite(d.ghost) && Math.abs(x(v) - x(d.ghost)) < 80 * fs) continue;
    s += text(x(v), barBot + 50 * fs, `${v * 100}%`, 'tick', v === 0 ? 'start' : v === 1 ? 'end' : 'middle');
  }
  s += `</svg>`;
  return s;
}
