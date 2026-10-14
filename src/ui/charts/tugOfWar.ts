import { fontScale, line, linear, svgOpen, text } from './svg';

export interface TugData {
  /** P1 win proportion and its 95% CI */
  p: number;
  lo: number;
  hi: number;
  /** exact P1 win probability, NaN when there is no closed form */
  exact: number;
  /** a reference P1 rate to compare against (e.g. baseline), NaN for none */
  ghost: number;
}

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
  if (Number.isFinite(d.p)) {
    const bx = x(d.p);
    s += `<rect x="${x(0)}" y="${barTop}" width="${bx - x(0)}" height="${barH}" fill="var(--p1)" class="tug"/>`;
    s += `<rect x="${bx}" y="${barTop}" width="${x(1) - bx}" height="${barH}" fill="var(--p2)" class="tug"/>`;
    s += text(x(0) + 20 * fs, barTop + barH / 2 + 12 * fs, 'P1', 'tug-label', 'start');
    s += text(x(1) - 20 * fs, barTop + barH / 2 + 12 * fs, 'P2', 'tug-label', 'end');
    // CI whisker straddling the boundary
    const yMid = barTop + barH / 2;
    const cap = barH * 0.3;
    s += line(x(d.lo), yMid, x(d.hi), yMid, 'whisker on-bar');
    s += line(x(d.lo), yMid - cap, x(d.lo), yMid + cap, 'whisker on-bar');
    s += line(x(d.hi), yMid - cap, x(d.hi), yMid + cap, 'whisker on-bar');
  } else {
    s += `<rect x="${x(0)}" y="${barTop}" width="${x(1) - x(0)}" height="${barH}" class="tug-empty"/>`;
  }
  // fair line
  s += line(x(0.5), barTop - 16 * fs, x(0.5), barBot + 16 * fs, 'fair');
  s += text(x(0.5), barTop - 22 * fs, '50% = fair', 'fair-label');
  if (Number.isFinite(d.exact)) {
    s += line(x(d.exact), barTop - 6 * fs, x(d.exact), barBot + 6 * fs, 'exact');
  }
  if (Number.isFinite(d.ghost)) {
    s += line(x(d.ghost), barBot + 4 * fs, x(d.ghost), barBot + 26 * fs, 'ghost');
    s += text(x(d.ghost), barBot + 50 * fs, 'baseline', 'ghost-label');
  }
  for (const v of [0, 0.25, 0.75, 1]) {
    s += text(x(v), barBot + 50 * fs, `${v * 100}%`, 'tick', v === 0 ? 'start' : v === 1 ? 'end' : 'middle');
  }
  s += `</svg>`;
  return s;
}
