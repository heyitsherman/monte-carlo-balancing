/** Small DOM + animation helpers shared by the UI. */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Interpolate between two data structures of the same shape: numbers are lerped,
 * arrays/objects recurse, anything else snaps to the target. NaN snaps too.
 */
export function lerpData<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return b;
    return (a + (b - a) * t) as T;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return b;
    return b.map((v, i) => lerpData(a[i], v, t)) as T;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(b)) out[k] = lerpData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t);
    return out as T;
  }
  return b;
}

/** Run `frame(t)` with eased t from 0→1 over `ms`. Resolves when done or when `cancelled()` turns true. */
export function animate(ms: number, frame: (t: number) => void, cancelled: () => boolean = () => false): Promise<void> {
  if (ms <= 0 || prefersReducedMotion()) {
    frame(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now: number) => {
      if (cancelled()) return resolve();
      const t = Math.min(1, (now - t0) / ms);
      frame(easeInOut(t));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}

/** Format a number with fixed digits, or an em dash when not finite. */
export const fx = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
