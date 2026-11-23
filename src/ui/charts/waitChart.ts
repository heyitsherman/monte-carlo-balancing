import { fx } from '../util';
import { fontScale, line, linear, n2, svgOpen, text } from './svg';

/**
 * How many tries each player needed: one bar per number of tries (filled, the current rule), an optional
 * outline for a reference rule, and labelled markers (the average, the unluckiest 1 in 100). The long tail
 * past `xMax` is counted in words, so the chart keeps a fixed scale.
 */
export interface WaitChartData {
  /** Share of players per number of tries; index = tries, length xMax + 1 (index 0 unused). */
  cur: number[];
  /** The same for a reference rule, drawn as an outline; null for none. */
  ref: number[] | null;
  /** Share of players who needed more than xMax tries. */
  over: number;
  yMax: number;
  xMax: number;
  markers: { x: number; label: string }[];
  curLabel: string;
  refLabel: string;
}

/** Shares per number of tries, padded or cut to xMax, plus the share beyond it. */
export function waitShares(counts: number[], xMax: number): { shares: number[]; over: number } {
  const total = counts.reduce((s, x) => s + x, 0);
  const shares = new Array<number>(xMax + 1).fill(0);
  let inRange = 0;
  for (let k = 1; k <= xMax && k < counts.length; k++) {
    shares[k] = total > 0 ? counts[k] / total : 0;
    inRange += counts[k];
  }
  return { shares, over: total > 0 ? Math.max(0, (total - inRange) / total) : 0 };
}

/** A y-axis top that fits the tallest bar (ignoring try `skip`, e.g. the pity try), rounded up to a tidy step. */
export function waitYMax(series: (number[] | null)[], skip = 0): number {
  let top = 0;
  for (const s of series) if (s) for (let k = 1; k < s.length; k++) if (k !== skip) top = Math.max(top, s[k]);
  const step = top > 0.2 ? 0.1 : top > 0.06 ? 0.02 : 0.01;
  return Math.max(0.02, Math.ceil(top / step - 1e-9) * step);
}

export function renderWait(d: WaitChartData, w: number, h: number): string {
  const fs = fontScale();
  // On narrow screens the legend items stack instead of sharing one line.
  const narrow = w < 700;
  const legendLines = narrow ? 1 + (d.ref ? 1 : 0) + (d.over > 0.0005 ? 1 : 0) : 1;
  const m = { l: 74 * fs, r: 24 * fs, t: (38 + 26 * legendLines) * fs, b: 70 * fs };
  const bw = (w - m.l - m.r) / d.xMax;
  const x = (k: number) => m.l + (k - 1) * bw;
  const y = linear(0, d.yMax, h - m.b, m.t);

  let s = svgOpen(w, h, 'How many tries each player needed before the item dropped');
  let step = d.yMax > 0.2 ? 0.1 : d.yMax > 0.06 ? 0.02 : 0.01;
  while ((h - m.b - m.t) / (d.yMax / step) < 30 * fs) step *= 2;
  for (let i = 0; i * step <= d.yMax + 1e-9; i++) {
    const v = i * step;
    s += line(m.l, y(v), w - m.r, y(v), i === 0 ? 'axis' : 'grid');
    s += text(m.l - 10 * fs, y(v) + 7 * fs, `${Math.round(v * 100)}%`, 'tick', 'end');
  }
  for (let k = 1; k <= d.xMax; k++) {
    const v = d.cur[k] ?? 0;
    if (v > 0) {
      const top = y(Math.min(v, d.yMax));
      s += `<rect x="${n2(x(k) + 0.5)}" y="${n2(top)}" width="${n2(Math.max(1, bw - 1))}" height="${n2(y(0) - top)}" class="wait-bar"/>`;
      // A bar taller than the axis (the pity try) is cut at the top and its value written beside it.
      if (v > d.yMax * 1.02) {
        s += line(x(k) - 3 * fs, top + 10 * fs, x(k) + bw + 3 * fs, top + 4 * fs, 'clip-mark');
        // Stacked under the marker labels, so it never collides with them.
        const right = x(k) > w * 0.7;
        s += text(x(k) + (right ? -8 : bw + 8) * fs, m.t + 18 * fs + d.markers.length * 28 * fs, `${fx(v * 100)}% on try ${k}`, 'marker-label', right ? 'end' : 'start');
      }
    }
    if (k % 10 === 0 || k === 1) s += text(x(k) + bw / 2, h - m.b + 28 * fs, String(k), 'tick');
  }
  if (d.ref) {
    let path = `M${n2(x(1))},${n2(y(0))}`;
    for (let k = 1; k <= d.xMax; k++) {
      const v = Math.min(d.ref[k] ?? 0, d.yMax);
      path += ` L${n2(x(k))},${n2(y(v))} L${n2(x(k) + bw)},${n2(y(v))}`;
    }
    s += `<path d="${path}" class="hist-ref"/>`;
  }
  // Markers, labels stacked so neighbours never overlap.
  d.markers.forEach((mk, i) => {
    const mx = x(Math.min(mk.x, d.xMax)) + bw / 2;
    s += line(mx, m.t - 4 * fs, mx, y(0), 'wait-marker');
    const right = mx > w * 0.7;
    s += text(mx + (right ? -8 : 8) * fs, m.t + 18 * fs + i * 28 * fs, mk.label, 'marker-label', right ? 'end' : 'start');
  });
  s += text((m.l + w - m.r) / 2, h - 10 * fs, 'Tries until the item drops', 'axis-title');
  // Legend, and the tail beyond the axis in words.
  const lx0 = narrow ? 8 * fs : m.l;
  s += `<rect x="${lx0}" y="${8 * fs}" width="${22 * fs}" height="${22 * fs}" class="wait-bar"/>`;
  s += text(lx0 + 30 * fs, 27 * fs, d.curLabel, 'legend', 'start');
  let line2 = 1;
  if (d.ref) {
    const lx = narrow ? lx0 : m.l + 30 * fs + d.curLabel.length * 10.5 * fs + 40 * fs;
    const ly = narrow ? 26 * fs * line2++ : 0;
    s += `<rect x="${lx}" y="${8 * fs + ly}" width="${22 * fs}" height="${22 * fs}" class="hist-ref"/>`;
    s += text(lx + 30 * fs, 27 * fs + ly, d.refLabel, 'legend', 'start');
  }
  if (d.over > 0.0005) {
    const note = `${fx(d.over * 100)}% needed more than ${d.xMax} tries`;
    s += narrow ? text(lx0, 27 * fs + 26 * fs * line2, note, 'legend', 'start') : text(w - m.r, 27 * fs, note, 'legend', 'end');
  }
  s += `</svg>`;
  return s;
}
