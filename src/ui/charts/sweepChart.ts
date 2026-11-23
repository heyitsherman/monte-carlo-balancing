import { assess, formatInt, wilson, type AssessmentStatus, type Target } from '../../core/stats';
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
  /** The design target for P1's win rate; its band is shaded and colours each point. */
  target: Target;
}

/** Dot fill per assessment; "not enough data" is hollow. */
const STATUS_FILL: Record<AssessmentStatus, string> = {
  above: 'var(--p1)',
  on: 'var(--fair)',
  below: 'var(--p2)',
  unclear: 'var(--c-bg)',
};

/** The dot colours, named in text (colour never carries meaning alone). */
function legend(x: number, y: number, fs: number, t: Target): string {
  const items: [string, AssessmentStatus][] = [
    [t.labels.above, 'above'],
    [t.labels.on, 'on'],
    [t.labels.below, 'below'],
    ['Not enough data', 'unclear'],
  ];
  let s = '';
  let cx = x;
  for (const [label, status] of items) {
    s += `<circle cx="${cx + 9 * fs}" cy="${y - 7 * fs}" r="${8 * fs}" fill="${STATUS_FILL[status]}" class="legend-dot ${status}"/>`;
    s += text(cx + 24 * fs, y, label, 'legend', 'start');
    cx += (label.length * 10.5 + 60) * fs;
  }
  return s;
}

const pctEdge = (x: number) => `${Math.round(x * 1000) / 10}`;

/** 1D sweep: P1 win rate per parameter value with CI whiskers, 50% line, exact markers. */
export function renderSweep(d: SweepChartData, w: number, h: number): string {
  const fs = fontScale();
  // The top margin holds the legend, clear of the highest point's label.
  const m = { l: 90 * fs, r: 40 * fs, t: 76 * fs, b: 90 * fs };
  const band = (w - m.l - m.r) / d.xs.length;
  const cx = (i: number) => m.l + band * (i + 0.5);
  const y = linear(d.yMin, d.yMax, h - m.b, m.t);

  let s = svgOpen(w, h, 'Player 1 win rate for each head start, with 95% confidence intervals');
  const step = d.yMax - d.yMin > 0.45 ? 0.1 : 0.05;
  for (let v = Math.ceil(d.yMin / step) * step; v <= d.yMax + 1e-9; v += step) {
    s += line(m.l, y(v), w - m.r, y(v), 'grid');
    s += text(m.l - 12 * fs, y(v) + 7 * fs, `${Math.round(v * 100)}%`, 'tick', 'end');
  }
  s += legend(m.l, 26 * fs, fs, d.target);
  // The target band, shaded, with its edges and its name.
  const bLo = d.target.center - d.target.tolerance;
  const bHi = d.target.center + d.target.tolerance;
  s += `<rect x="${m.l}" y="${y(bHi)}" width="${w - m.r - m.l}" height="${y(bLo) - y(bHi)}" class="target-band"/>`;
  s += line(m.l, y(bHi), w - m.r, y(bHi), 'band-edge');
  s += line(m.l, y(bLo), w - m.r, y(bLo), 'band-edge');
  s += text(w - m.r, y(bHi) - 10 * fs, `${d.target.labels.on}: ${pctEdge(bLo)}–${pctEdge(bHi)}%`, 'fair-label', 'end');
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
    const status = assess(wl, d.target).status;
    const color = STATUS_FILL[status];
    if (Number.isFinite(p.exact)) s += line(cx(i) - 34 * fs, y(p.exact), cx(i) + 34 * fs, y(p.exact), 'exact');
    s += vWhisker(cx(i), y(wl.lo), y(wl.hi), 12 * fs);
    s += `<circle cx="${cx(i)}" cy="${y(wl.p)}" r="${11 * fs}" fill="${color}" class="dot ${status}"/>`;
    // value label then "± margin" underneath; above the point when P1 is favored, below otherwise
    const ly = wl.p >= d.target.center ? y(wl.hi) - 44 * fs : y(wl.lo) + 34 * fs;
    s += text(cx(i), ly, `${fx(wl.p * 100)}%`, 'pt-label');
    s += text(cx(i), ly + 26 * fs, `± ${fx(wl.marginPP)} pp`, 'pt-sub');
  }
  s += `</svg>`;
  return s;
}
