import { fontScale, line, linear, n2, svgOpen, text } from './svg';

export interface HistogramData {
  /** fractions per bucket (index = value) for the current config */
  current: number[];
  /** fractions per bucket for the reference config (drawn as an outline) */
  reference: number[];
  currentLabel: string;
  referenceLabel: string;
  xMax: number;
  xLabel: string;
}

/** Overlaid histograms: current config as filled bars, reference as a step outline. */
export function renderHistogram(d: HistogramData, w: number, h: number): string {
  const fs = fontScale();
  const m = { l: 70 * fs, r: 16 * fs, t: 48 * fs, b: 64 * fs };
  const at = (a: number[], i: number) => (i < a.length ? a[i] : 0);
  let yMax = 0;
  for (let i = 1; i <= d.xMax; i++) yMax = Math.max(yMax, at(d.current, i), at(d.reference, i));
  yMax = Math.max(0.05, Math.ceil(yMax * 20) / 20);
  const bw = (w - m.l - m.r) / d.xMax;
  const x = (i: number) => m.l + (i - 1) * bw;
  const y = linear(0, yMax, h - m.b, m.t);

  let s = svgOpen(w, h, 'Histogram of game length');
  let step = 0.05;
  while ((h - m.b - m.t) / (yMax / step) < 34 * fs) step *= 2;
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    s += line(m.l, y(v), w - m.r, y(v), v === 0 ? 'axis' : 'grid');
    s += text(m.l - 10 * fs, y(v) + 7 * fs, `${Math.round(v * 100)}%`, 'tick', 'end');
  }
  for (let i = 1; i <= d.xMax; i++) {
    const v = at(d.current, i);
    if (v > 0) s += `<rect x="${n2(x(i) + 1)}" y="${n2(y(v))}" width="${n2(bw - 2)}" height="${n2(y(0) - y(v))}" class="hist-bar"/>`;
    if (i % 5 === 0) s += text(x(i) + bw / 2, h - m.b + 28 * fs, String(i), 'tick');
  }
  // reference as a step outline
  let path = `M${n2(x(1))},${n2(y(0))}`;
  for (let i = 1; i <= d.xMax; i++) {
    const v = at(d.reference, i);
    path += ` L${n2(x(i))},${n2(y(v))} L${n2(x(i) + bw)},${n2(y(v))}`;
  }
  path += ` L${n2(x(d.xMax) + bw)},${n2(y(0))}`;
  s += `<path d="${path}" class="hist-ref"/>`;
  s += text((m.l + w - m.r) / 2, h - 10 * fs, d.xLabel, 'axis-title');
  // legend
  s += `<rect x="${m.l}" y="${8 * fs}" width="${22 * fs}" height="${22 * fs}" class="hist-bar"/>`;
  s += text(m.l + 30 * fs, 27 * fs, d.currentLabel, 'legend', 'start');
  const lx = m.l + 30 * fs + d.currentLabel.length * 12 * fs + 40 * fs;
  s += `<rect x="${lx}" y="${8 * fs}" width="${22 * fs}" height="${22 * fs}" class="hist-ref"/>`;
  s += text(lx + 30 * fs, 27 * fs, d.referenceLabel, 'legend', 'start');
  s += `</svg>`;
  return s;
}
