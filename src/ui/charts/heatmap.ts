import { fontScale, n2, svgOpen, text } from './svg';

/**
 * A 2D sweep: one cell per pair of settings. Every cell shows its value in words; the Cobalt shade only
 * repeats it (darker = higher), and cells inside the target band are filled Teal, named in the legend.
 */
export interface HeatmapData {
  xs: string[];
  ys: string[];
  /** values[yi][xi]; NaN for a cell not computed yet. */
  values: number[][];
  /** onTarget[yi][xi]; empty when there is no target. */
  onTarget: boolean[][];
  format: (v: number) => string;
  xLabel: string;
  yLabel: string;
  /** Legend line, e.g. "Teal: fair (47–53%)"; empty for none. */
  targetNote: string;
  aria: string;
}

export function renderHeatmap(d: HeatmapData, w: number, h: number): string {
  const fs = fontScale();
  const m = { l: 110 * fs, r: 16 * fs, t: 48 * fs, b: 76 * fs };
  const cw = (w - m.l - m.r) / Math.max(1, d.xs.length);
  const ch = (h - m.t - m.b) / Math.max(1, d.ys.length);
  const all = d.values.flat().filter(Number.isFinite);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const shade = (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
  const small = Math.min(cw, ch) < 46 * fs;

  let s = svgOpen(w, h, d.aria);
  d.ys.forEach((yv, yi) => {
    // Highest y value at the top, like a chart axis.
    const row = d.ys.length - 1 - yi;
    const y0 = m.t + row * ch;
    s += text(m.l - 12 * fs, y0 + ch / 2 + 7 * fs, yv, 'tick', 'end');
    d.xs.forEach((_, xi) => {
      const x0 = m.l + xi * cw;
      const v = d.values[yi]?.[xi] ?? NaN;
      if (!Number.isFinite(v)) {
        s += `<rect x="${n2(x0 + 1)}" y="${n2(y0 + 1)}" width="${n2(cw - 2)}" height="${n2(ch - 2)}" class="heat-empty"/>`;
        return;
      }
      const t = shade(v);
      const on = d.onTarget[yi]?.[xi];
      s += on
        ? `<rect x="${n2(x0 + 1)}" y="${n2(y0 + 1)}" width="${n2(cw - 2)}" height="${n2(ch - 2)}" class="heat-on"/>`
        : `<rect x="${n2(x0 + 1)}" y="${n2(y0 + 1)}" width="${n2(cw - 2)}" height="${n2(ch - 2)}" class="heat-cell" fill-opacity="${(0.1 + 0.8 * t).toFixed(3)}"/>`;
      const cls = on ? 'heat-text heat-text--target' : t > 0.55 ? 'heat-text heat-text--on' : 'heat-text';
      s += text(x0 + cw / 2, y0 + ch / 2 + 7 * fs, d.format(v), cls, 'middle', small ? 'font-size="0.75em"' : '');
    });
  });
  d.xs.forEach((xv, xi) => (s += text(m.l + xi * cw + cw / 2, h - m.b + 30 * fs, xv, 'tick')));
  s += text((m.l + w - m.r) / 2, h - 16 * fs, d.xLabel, 'axis-title');
  s += text(m.l, 28 * fs, `Rows: ${d.yLabel}`, 'legend', 'start');
  if (d.targetNote) s += text(w - m.r, 28 * fs, d.targetNote, 'legend', 'end');
  s += `</svg>`;
  return s;
}
