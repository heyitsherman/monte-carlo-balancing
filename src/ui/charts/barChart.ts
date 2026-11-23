import { formatInt } from '../../core/stats';
import { fx } from '../util';
import { fontScale, line, linear, svgOpen, text, vWhisker } from './svg';

export interface BarDatum {
  label: string;
  /** CSS color, e.g. `var(--p1)` */
  color: string;
  p: number;
  lo: number;
  hi: number;
  /** exact probability, NaN when unknown */
  exact: number;
}

export interface BarChartData {
  bars: BarDatum[];
  n: number;
  /** 0 → hidden, 1 → exact markers fully shown (tweenable) */
  exactAlpha: number;
  /** y-axis range (tweenable). Bars need yMin = 0; zoom in with `zoom`. */
  yMin: number;
  yMax: number;
  /**
   * 0 → bars from 0%, 1 → dots on a zoomed axis (tweenable). Bars cut off at a non-zero
   * baseline would exaggerate differences, so they fade into dots as the axis zooms.
   */
  zoom: number;
}

/** Gridline step that keeps roughly 3–8 lines on screen for a y-range. */
function tickStep(range: number): number {
  return range > 0.6 ? 0.2 : range > 0.3 ? 0.1 : range > 0.12 ? 0.05 : 0.02;
}

const READOUT_H = 150;

/** Bar chart with 95% CI whiskers and optional exact-value markers, plus big HTML readouts per bar. */
export function renderBarChart(d: BarChartData, w: number, h: number): string {
  const fs = fontScale();
  const readoutH = READOUT_H * fs;
  const ch = Math.max(120, h - readoutH);
  const m = { l: 80 * fs, r: 30 * fs, t: 24 * fs, b: 56 * fs };
  const pw = w - m.l - m.r;
  const y = linear(d.yMin, d.yMax, ch - m.b, m.t);
  const clampY = (v: number) => y(Math.min(d.yMax, Math.max(d.yMin, v)));
  const band = pw / d.bars.length;
  const bw = Math.min(band * 0.42, 260);
  const barAlpha = 1 - d.zoom;

  let s = svgOpen(w, ch, 'Bar chart of outcome frequencies with 95% confidence intervals');
  s += `<g style="--fs:${fs}">`;
  const step = tickStep(d.yMax - d.yMin);
  for (let i = Math.ceil(d.yMin / step - 1e-9); i * step <= d.yMax + 1e-9; i++) {
    const v = i * step;
    s += line(m.l, y(v), w - m.r, y(v), i === 0 ? 'axis' : 'grid');
    s += text(m.l - 12 * fs, y(v) + 7 * fs, `${Math.round(v * 100)}%`, 'tick', 'end');
  }
  if (d.zoom > 0.01) {
    s += line(m.l, y(d.yMin), w - m.r, y(d.yMin), 'axis', `opacity="${d.zoom}"`);
    s += text(w - m.r, m.t - 4 * fs, 'Zoomed in: dots are the simulated values', 'axis-title', 'end', `opacity="${d.zoom}"`);
  }
  d.bars.forEach((b, i) => {
    const cx = m.l + band * (i + 0.5);
    const hasP = Number.isFinite(b.p);
    if (hasP && barAlpha > 0.01) {
      const top = clampY(b.p);
      s += `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${Math.max(0, y(d.yMin) - top)}" fill="${b.color}" class="bar" opacity="${barAlpha}"/>`;
    }
    if (d.exactAlpha > 0.01 && Number.isFinite(b.exact)) {
      const ey = y(b.exact);
      const half = bw / 2 + 28 * fs;
      s += `<g opacity="${d.exactAlpha}">`;
      s += line(cx - half, ey, cx + half, ey, 'exact');
      s += text(cx + half + 8 * fs, ey + 7 * fs, 'exact', 'exact-label', 'start');
      s += `</g>`;
    }
    if (hasP) {
      s += vWhisker(cx, clampY(b.lo), clampY(b.hi), bw * 0.18);
      if (d.zoom > 0.01) {
        s += `<circle cx="${cx}" cy="${clampY(b.p)}" r="${11 * fs}" fill="${b.color}" class="dot" opacity="${d.zoom}"/>`;
      }
    }
    // Wrap long category labels onto two lines when the band is narrow (phones).
    const words = b.label.split(' ');
    if (b.label.length * 14 * fs > band * 0.95 && words.length > 1) {
      const cut = Math.ceil(words.length / 2);
      s += text(cx, ch - m.b + 30 * fs, words.slice(0, cut).join(' '), 'cat-label');
      s += text(cx, ch - m.b + 56 * fs, words.slice(cut).join(' '), 'cat-label');
    } else {
      s += text(cx, ch - m.b + 38 * fs, b.label, 'cat-label');
    }
  });
  s += `</g></svg>`;

  const cols = d.bars
    .map((b) => {
      const exact =
        d.exactAlpha > 0.01 && Number.isFinite(b.exact)
          ? `<div class="ro-exact" style="opacity:${d.exactAlpha}">exact ${fx(b.exact * 100, 2)}%</div>`
          : '';
      return `<div class="ro-col" style="--line:${b.color}">
        <div class="ro-big">${fx(b.p * 100)}%</div>
        <div class="ro-small">± ${fx(((b.hi - b.lo) / 2) * 100)} pp (n = ${formatInt(d.n)})</div>
        ${exact}
      </div>`;
    })
    .join('');
  const ro = `<div class="readouts" style="height:${readoutH}px;padding-left:${m.l}px;padding-right:${m.r}px;grid-template-columns:repeat(${d.bars.length},1fr)">${cols}</div>`;
  return s + ro;
}
