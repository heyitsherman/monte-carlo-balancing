import { formatInt } from '../../core/stats';
import { fx } from '../util';
import { fontScale, line, linear, log10Scale, n2, svgOpen, text } from './svg';

export interface TracePoint {
  n: number;
  p: number;
  lo: number;
  hi: number;
}

export interface ConvergenceData {
  points: TracePoint[];
  exact: number;
  /** log10 of the largest n currently revealed (tweenable for the Show-mode animation) */
  revealLog: number;
  xMax: number;
  color: string;
  label: string;
}

/** Running estimate vs N on a log x-axis, with a 95% CI band and the exact value as a dashed line. */
export function renderConvergence(d: ConvergenceData, w: number, h: number): string {
  const fs = fontScale();
  const m = { l: 90 * fs, r: 200 * fs, t: 30 * fs, b: 70 * fs };
  const x = log10Scale(1, d.xMax, m.l, w - m.r);
  const y = linear(0, 1, h - m.b, m.t);
  const revealN = 10 ** d.revealLog;
  const pts = d.points.filter((p) => p.n <= revealN + 1e-6);

  let s = svgOpen(w, h, 'Running estimate converging to the exact value as N grows');
  for (let v = 0; v <= 1 + 1e-9; v += 0.2) {
    s += line(m.l, y(v), w - m.r, y(v), v === 0 ? 'axis' : 'grid');
    s += text(m.l - 12 * fs, y(v) + 7 * fs, `${Math.round(v * 100)}%`, 'tick', 'end');
  }
  for (let e = 0; 10 ** e <= d.xMax; e++) {
    const v = 10 ** e;
    s += line(x(v), m.t, x(v), h - m.b, 'grid');
    s += text(x(v), h - m.b + 32 * fs, formatInt(v), 'tick');
  }
  s += text((m.l + w - m.r) / 2, h - 12 * fs, 'Number of simulated battles (log scale)', 'axis-title');

  if (pts.length > 1) {
    const upper = pts.map((p) => `${n2(x(p.n))},${n2(y(p.hi))}`);
    const lower = pts.map((p) => `${n2(x(p.n))},${n2(y(p.lo))}`).reverse();
    s += `<polygon points="${[...upper, ...lower].join(' ')}" fill="${d.color}" class="band"/>`;
    s += `<polyline points="${pts.map((p) => `${n2(x(p.n))},${n2(y(p.p))}`).join(' ')}" stroke="${d.color}" class="trace"/>`;
  }

  s += line(m.l, y(d.exact), w - m.r, y(d.exact), 'exact');
  s += text(w - m.r + 10 * fs, y(d.exact) - 10 * fs, 'exact', 'exact-label', 'start');
  s += text(w - m.r + 10 * fs, y(d.exact) + 22 * fs, `${fx(d.exact * 100, 2)}%`, 'exact-label', 'start');

  const last = pts[pts.length - 1];
  if (last) {
    s += `<circle cx="${n2(x(last.n))}" cy="${n2(y(last.p))}" r="${8 * fs}" fill="${d.color}" class="dot"/>`;
  }
  s += `</svg>`;

  const ro = last
    ? `<div class="conv-readout"><span class="ro-label">${d.label}</span>
        <span class="ro-big" style="color:${d.color}">${fx(last.p * 100)}%</span>
        <span class="ro-small">± ${fx(((last.hi - last.lo) / 2) * 100, last.n >= 10000 ? 2 : 1)} pp (n = ${formatInt(last.n)})</span></div>`
    : '';
  return ro + s;
}
