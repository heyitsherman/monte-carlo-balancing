import { fontScale, line, linear, svgOpen, text, vWhisker } from './svg';

/**
 * A sweep over one setting: a dot per value with its 95% CI whisker and the exact answer as a dashed
 * marker. Unlike the race's sweep chart (P1 win rate against the fair band), this one draws any estimate
 * (points per turn, series wins) and marks a highlighted dot, e.g. the best plan or the shortest series
 * that meets the target. Colour never carries meaning alone: the legend names every mark.
 */
export type DotTone = 'p1' | 'p2' | 'ink' | 'best';

export interface DotPoint {
  value: number;
  lo: number;
  hi: number;
  /** Exact answer, NaN when there is none. */
  exact: number;
  tone: DotTone;
  /** Small line under the value, e.g. "± 0.9 pp". */
  sub: string;
}

export interface DotSweepData {
  /** Category labels along the x-axis. */
  xs: string[];
  /** Points revealed so far; points[i] belongs to xs[i]. */
  points: DotPoint[];
  yMin: number;
  yMax: number;
  yStep: number;
  yFormat: (v: number) => string;
  valueFormat: (v: number) => string;
  xLabel: string;
  /** A target band to shade, with its caption. */
  band: { lo: number; hi: number; label: string } | null;
  legend: { mark: DotTone | 'exact'; label: string }[];
  aria: string;
}

const FILL: Record<DotTone, string> = {
  p1: 'var(--p1)',
  p2: 'var(--p2)',
  ink: 'var(--c-text)',
  best: 'var(--fair)',
};

function legend(d: DotSweepData, x: number, y0: number, fs: number, right: number): string {
  let s = '';
  let cx = x;
  let y = y0;
  // The target band is named in the legend (a shaded swatch), so its caption never sits on the points.
  const items = [...d.legend, ...(d.band ? [{ mark: 'band' as const, label: d.band.label }] : [])];
  for (const item of items) {
    const width = (item.label.length * 10.5 + 70) * fs;
    // Wrap to a second line rather than run off the edge (phones).
    if (cx > x && cx + width - 30 * fs > right) {
      cx = 8 * fs;
      y += 28 * fs;
    }
    if (item.mark === 'exact') s += line(cx, y - 7 * fs, cx + 30 * fs, y - 7 * fs, 'exact');
    else if (item.mark === 'band') s += `<rect x="${cx}" y="${y - 19 * fs}" width="${30 * fs}" height="${22 * fs}" class="target-band"/>`;
    else s += `<circle cx="${cx + 15 * fs}" cy="${y - 7 * fs}" r="${8 * fs}" fill="${FILL[item.mark]}" class="legend-dot"/>`;
    s += text(cx + 38 * fs, y, item.label, 'legend', 'start');
    cx += width;
  }
  return s;
}

export function renderDotSweep(d: DotSweepData, w: number, h: number): string {
  const fs = fontScale();
  const m = { l: 90 * fs, r: 40 * fs, t: 76 * fs, b: 90 * fs };
  const band = (w - m.l - m.r) / d.xs.length;
  const cx = (i: number) => m.l + band * (i + 0.5);
  const y = linear(d.yMin, d.yMax, h - m.b, m.t);
  const clampY = (v: number) => y(Math.min(d.yMax, Math.max(d.yMin, v)));

  let s = svgOpen(w, h, d.aria);
  if (d.band) {
    const top = clampY(d.band.hi);
    const bot = clampY(d.band.lo);
    s += `<rect x="${m.l}" y="${top}" width="${w - m.r - m.l}" height="${bot - top}" class="target-band"/>`;
    if (d.band.lo > d.yMin) s += line(m.l, bot, w - m.r, bot, 'band-edge');
    if (d.band.hi < d.yMax) s += line(m.l, top, w - m.r, top, 'band-edge');
  }
  for (let i = Math.ceil(d.yMin / d.yStep - 1e-9); i * d.yStep <= d.yMax + 1e-9; i++) {
    const v = i * d.yStep;
    s += line(m.l, y(v), w - m.r, y(v), 'grid');
    s += text(m.l - 12 * fs, y(v) + 7 * fs, d.yFormat(v), 'tick', 'end');
  }
  s += legend(d, m.l, 26 * fs, fs, w);
  d.xs.forEach((v, i) => (s += text(cx(i), h - m.b + 36 * fs, v, 'cat-label')));
  s += text((m.l + w - m.r) / 2, h - 14 * fs, d.xLabel, 'axis-title');

  if (d.points.length > 1) {
    const pts = d.points.map((p, i) => `${cx(i)},${clampY(p.value)}`).join(' ');
    s += `<polyline points="${pts}" class="sweep-line"/>`;
  }
  d.points.forEach((p, i) => {
    if (Number.isFinite(p.exact)) s += line(cx(i) - 34 * fs, y(p.exact), cx(i) + 34 * fs, y(p.exact), 'exact');
    s += vWhisker(cx(i), clampY(p.lo), clampY(p.hi), 12 * fs);
    s += `<circle cx="${cx(i)}" cy="${clampY(p.value)}" r="${(p.tone === 'best' ? 14 : 11) * fs}" fill="${FILL[p.tone]}" class="dot"/>`;
    // The value above its whisker, unless that would run into the legend; then below.
    const above = clampY(p.hi) - 44 * fs;
    const ly = above > 56 * fs ? above : clampY(p.lo) + 34 * fs;
    s += text(cx(i), ly, d.valueFormat(p.value), p.tone === 'best' ? 'pt-label pt-label--best' : 'pt-label');
    s += text(cx(i), ly + 26 * fs, p.sub, 'pt-sub');
  });
  s += `</svg>`;
  return s;
}
