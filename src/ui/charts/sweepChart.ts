import { formatInt, verdict, wilson } from '../../core/stats';
import { fx } from '../util';
import { fontScale, line, linear, svgOpen, text, vWhisker } from './svg';

export interface SweepPoint {
  x: number;
  k: number;
  n: number;
  /** exact value, NaN if none */
  exact: number;
}

export interface SweepChartData {
  xs: number[];
  /** computed points so far (Show mode reveals them one by one) */
  points: SweepPoint[];
  yMin: number;
  yMax: number;
  xLabel: string;
  nPerCell: number;
}

const verdictColor = (v: string) => (v === 'Favors P1' ? 'var(--p1)' : v === 'Favors P2' ? 'var(--p2)' : 'var(--fair)');

/** 1D sweep: P1 win rate per parameter value with CI whiskers, 50% line, exact markers. */
export function renderSweep(d: SweepChartData, w: number, h: number): string {
  const fs = fontScale();
  const m = { l: 90 * fs, r: 40 * fs, t: 30 * fs, b: 90 * fs };
  const band = (w - m.l - m.r) / d.xs.length;
  const cx = (i: number) => m.l + band * (i + 0.5);
  const y = linear(d.yMin, d.yMax, h - m.b, m.t);

  let s = svgOpen(w, h, 'Player 1 win rate for each head start, with 95% confidence intervals');
  const step = d.yMax - d.yMin > 0.45 ? 0.1 : 0.05;
  for (let v = Math.ceil(d.yMin / step) * step; v <= d.yMax + 1e-9; v += step) {
    s += line(m.l, y(v), w - m.r, y(v), 'grid');
    s += text(m.l - 12 * fs, y(v) + 7 * fs, `${Math.round(v * 100)}%`, 'tick', 'end');
  }
  s += line(m.l, y(0.5), w - m.r, y(0.5), 'fair');
  s += text(w - m.r, y(0.5) - 10 * fs, '50% = fair', 'fair-label', 'end');
  d.xs.forEach((v, i) => (s += text(cx(i), h - m.b + 36 * fs, String(v), 'cat-label')));
  s += text((m.l + w - m.r) / 2, h - 14 * fs, `${d.xLabel} — each point n = ${formatInt(d.nPerCell)}`, 'axis-title');

  const idx = (x: number) => d.xs.indexOf(x);
  if (d.points.length > 1) {
    const pts = d.points.map((p) => `${cx(idx(p.x))},${y(p.k / p.n)}`).join(' ');
    s += `<polyline points="${pts}" class="sweep-line"/>`;
  }
  for (const p of d.points) {
    const i = idx(p.x);
    const wl = wilson(p.k, p.n);
    const color = verdictColor(verdict(wl));
    if (Number.isFinite(p.exact)) s += line(cx(i) - 34 * fs, y(p.exact), cx(i) + 34 * fs, y(p.exact), 'exact');
    s += vWhisker(cx(i), y(wl.lo), y(wl.hi), 12 * fs);
    s += `<circle cx="${cx(i)}" cy="${y(wl.p)}" r="${11 * fs}" fill="${color}" class="dot"/>`;
    // value label then "± margin" underneath; above the point when P1 is favored, below otherwise
    const ly = wl.p >= 0.5 ? y(wl.hi) - 44 * fs : y(wl.lo) + 34 * fs;
    s += text(cx(i), ly, `${fx(wl.p * 100)}%`, 'pt-label', 'middle', `fill="${color}"`);
    s += text(cx(i), ly + 26 * fs, `± ${fx(wl.marginPP)} pp`, 'pt-sub');
  }
  s += `</svg>`;
  return s;
}
