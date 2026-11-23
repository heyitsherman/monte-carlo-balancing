/** Tiny helpers for building SVG strings. Colors always come from CSS custom properties. */

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export const log10Scale = (d0: number, d1: number, r0: number, r1: number) => {
  const l0 = Math.log10(d0);
  const l1 = Math.log10(d1);
  return (v: number) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0);
};

export const n2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : 0);

export function line(x1: number, y1: number, x2: number, y2: number, cls: string, extra = ''): string {
  return `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" class="${cls}" ${extra}/>`;
}

export function text(x: number, y: number, s: string, cls: string, anchor = 'middle', extra = ''): string {
  return `<text x="${n2(x)}" y="${n2(y)}" text-anchor="${anchor}" class="${cls}" ${extra}>${s}</text>`;
}

/** Vertical CI whisker from y(lo) to y(hi) with caps, on a ground-coloured halo so it reads over any bar. */
export function vWhisker(x: number, yLo: number, yHi: number, cap: number, cls = 'whisker'): string {
  const parts = (c: string) =>
    line(x, yLo, x, yHi, c) + line(x - cap, yLo, x + cap, yLo, c) + line(x - cap, yHi, x + cap, yHi, c);
  return parts(`${cls} halo`) + parts(cls);
}

/** Horizontal CI whisker from x(lo) to x(hi) with caps, on a halo. */
export function hWhisker(xLo: number, xHi: number, y: number, cap: number, cls = 'whisker'): string {
  const parts = (c: string) =>
    line(xLo, y, xHi, y, c) + line(xLo, y - cap, xLo, y + cap, c) + line(xHi, y - cap, xHi, y + cap, c);
  return parts(`${cls} halo`) + parts(cls);
}

export function svgOpen(w: number, h: number, label: string): string {
  return `<svg class="chart" width="${n2(w)}" height="${n2(h)}" viewBox="0 0 ${n2(w)} ${n2(h)}" role="img" aria-label="${label}" style="--fs:${fontScale().toFixed(3)}">`;
}

/**
 * Chart type scale. Follows the root font size, which grows with the window in stage mode
 * (16 px at 1280×720, 24 px at 1920×1080), and shrinks on narrow screens, never below 0.7.
 */
export const fontScale = () => {
  if (typeof document === 'undefined') return 1;
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const narrow = Math.max(0.7, Math.min(1, innerWidth / 1200));
  return (root / 16) * narrow;
};
