/**
 * Layout stability (heyitsherman-web-game §5): nothing on screen may change size while a step plays.
 *
 * - `reserveHeight` / `reserveWidth` render every text an element can show at its current width and fix
 *   its min-height / min-width at the largest, so swapping the text never moves anything else.
 * - `LayoutCheck` (open the page with `?layout-check`) watches the frame and the chapters' persistent
 *   containers and logs any size change that happens *within* a step. Changes caused by moving to
 *   another step, a window resize or a re-measure are expected and ignored. `mcb.layoutChanges()` in the
 *   console lists what was found; after a full run through the talk it must be empty.
 */

function reserve(el: HTMLElement, variants: string[], dim: 'height' | 'width', html: boolean): void {
  if (!el.getClientRects().length) return; // not shown at this screen size
  const prop = dim === 'height' ? 'minHeight' : 'minWidth';
  const saved = el.innerHTML;
  el.style[prop] = '';
  let max = 0;
  for (const v of variants) {
    if (html) el.innerHTML = v;
    else el.textContent = v;
    const b = el.getBoundingClientRect();
    max = Math.max(max, dim === 'height' ? b.height : b.width);
  }
  el.innerHTML = saved;
  el.style[prop] = `${Math.ceil(max)}px`;
  lastReserve = performance.now();
}

let lastReserve = 0;

/** Fix `el`'s min-height at the tallest of `variants` (plain text). */
export const reserveHeight = (el: HTMLElement, variants: string[]) => reserve(el, variants, 'height', false);

/** Fix `el`'s min-width at the widest of `variants` (HTML). */
export const reserveWidth = (el: HTMLElement, variants: string[]) => reserve(el, variants, 'width', true);

/** Frame elements plus each chapter's persistent containers. */
const WATCHED = [
  '.band',
  '.slide-caption',
  '.sub',
  '.stage-wrap',
  '.footer',
  '.view',
  '.controls',
  '.result-grid',
  '.race-readout',
  '.feel-card',
  '.tug-host',
  '.pt-grid',
  '.pt-truth',
  '.match',
  '.lt-dice',
  '.lt-total',
  '.mu-list',
  '.loot-stats',
  '.wait-host',
  '.fight',
  '.talk-lanes',
  '.track',
  '.turn-info',
  '.battle-view',
  '.bars-host',
  '.chart-host',
].join(', ');

export interface LayoutChange {
  el: string;
  from: string;
  to: string;
  /** Which step it happened on, as `chapter.step` (1-based step). */
  at: string;
}

export class LayoutCheck {
  private found: LayoutChange[] = [];
  private seen = new Map<Element, string>();
  private settling = true;
  private resizedAt = 0;

  constructor(
    root: HTMLElement,
    private where: () => string,
  ) {
    window.addEventListener('resize', () => (this.resizedAt = performance.now()));
    const ro = new ResizeObserver((entries) => this.onResize(entries));
    root.querySelectorAll(WATCHED).forEach((e) => ro.observe(e));
    this.navigated();
    console.info('layout-check on: size changes within a step are logged; mcb.layoutChanges() lists them.');
  }

  /** The presenter moved to a step: whatever the next frame lays out is the new baseline. */
  navigated(): void {
    this.settling = true;
    requestAnimationFrame(() => requestAnimationFrame(() => (this.settling = false)));
  }

  changes(): LayoutChange[] {
    return this.found.slice();
  }

  private onResize(entries: ResizeObserverEntry[]): void {
    const now = performance.now();
    const quiet = !this.settling && now - this.resizedAt > 600 && now - lastReserve > 600;
    for (const e of entries) {
      const t = e.target as HTMLElement;
      const visible = t.checkVisibility ? t.checkVisibility() : t.getClientRects().length > 0;
      const b = t.getBoundingClientRect();
      const size = visible ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'hidden';
      const prev = this.seen.get(t);
      this.seen.set(t, size);
      if (!quiet || prev === undefined || prev === size || prev === 'hidden' || size === 'hidden') continue;
      const name = `.${String(t.className).trim().split(/\s+/).join('.')}`;
      const at = this.where();
      this.found.push({ el: name, from: prev, to: size, at });
      console.warn(`layout-check: ${name} changed size ${prev} -> ${size}`);
    }
  }
}
