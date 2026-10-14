import { randomSeed } from '../core/rng';
import type { Runner } from '../core/runner';
import { formatInt } from '../core/stats';
import type { AppContext, Chapter, EnterInfo, Mode } from './types';
import { el, esc } from './util';

export const DEFAULT_SEED = 'dgt-balance';
const STORAGE_KEY = 'mcb:last-chapter';

const KEYS: [string, string][] = [
  ['→  Space  PgDn', 'Next step'],
  ['←  PgUp', 'Previous step'],
  ['R', 'Re-run current step'],
  ['F', 'Toggle Show / Fast mode'],
  ['S', 'Reseed (random)'],
  ['+  −', 'Adjust the active slider / toggle'],
  ['1 – 4', 'Jump to chapter'],
  ['T', 'Toggle light / dark theme'],
  ['Esc', 'Show / hide this help'],
];

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — not important */
  }
}

/**
 * Chapter/step state machine, keyboard control, caption, footer and help overlay.
 * Chapters are mounted once and kept alive; only the active one is visible.
 */
export class Presenter {
  private ci = 0;
  private si = 0;
  private mode: Mode = 'show';
  private seed = DEFAULT_SEED;
  private epoch = 0;
  private subOverride: string | null = null;

  private captionEl: HTMLElement;
  private subEl: HTMLElement;
  private stages: HTMLElement[] = [];
  private footerInfo: HTMLElement;
  private footnote: HTMLElement;
  private help: HTMLElement;
  private progressEl: HTMLElement;
  readonly ctx: AppContext;

  constructor(
    private root: HTMLElement,
    private chapters: Chapter[],
    private runner: Runner,
  ) {
    const self = this;
    this.ctx = {
      get seed() {
        return self.seed;
      },
      get mode() {
        return self.mode;
      },
      get epoch() {
        return self.epoch;
      },
      runner,
      alive: (e) => e === self.epoch,
      wait: (ms, e) => new Promise((r) => setTimeout(() => r(e === self.epoch), ms)),
      setSub: (text) => {
        self.subOverride = text;
        self.renderSub();
      },
    };

    root.innerHTML = '';
    this.captionEl = el('h2', { class: 'caption', 'aria-live': 'polite' });
    this.subEl = el('p', { class: 'sub' });
    const stageWrap = el('main', { class: 'stage-wrap' });
    for (const ch of chapters) {
      const s = el('section', { class: 'stage', 'data-chapter': ch.id });
      s.hidden = true;
      stageWrap.append(s);
      this.stages.push(s);
      ch.mount(s, this.ctx);
    }
    this.footnote = el('div', { class: 'footnote' }, '± is a 95% confidence interval. Quadruple the runs to halve it.');
    const footer = el('footer', { class: 'footer' });
    this.progressEl = el('div', { class: 'progress', 'aria-hidden': 'true' });
    this.footerInfo = el('div', { class: 'footer-info' });
    const nav = el('div', { class: 'footer-nav' });
    const btn = (label: string, title: string, fn: () => void) => {
      const b = el('button', { type: 'button', title, 'aria-label': title }, label);
      b.addEventListener('click', () => {
        fn();
        b.blur();
      });
      return b;
    };
    nav.append(
      btn('◀', 'Previous step', () => this.prev()),
      btn('▶', 'Next step', () => this.next()),
      btn('R', 'Re-run', () => this.rerun()),
      btn('F', 'Toggle Show / Fast', () => this.toggleMode()),
      btn('?', 'Keys', () => this.toggleHelp()),
    );
    footer.append(this.footerInfo, nav);
    this.help = el('div', { class: 'help', role: 'dialog', 'aria-label': 'Keyboard shortcuts' });
    this.help.innerHTML = `<div class="help-card"><h3>Keys</h3><dl>${KEYS.map(
      ([k, d]) => `<dt>${esc(k)}</dt><dd>${esc(d)}</dd>`,
    ).join('')}</dl><p>Mouse/touch: use the buttons bottom-right. Esc to close.</p></div>`;
    this.help.hidden = true;
    this.help.addEventListener('click', () => this.toggleHelp());
    root.append(this.captionEl, this.subEl, stageWrap, this.footnote, footer, this.progressEl, this.help);

    runner.onSimulated = () => this.renderFooter();
    window.addEventListener('keydown', (e) => this.onKey(e));

    window.addEventListener('hashchange', () => this.followHash());
    // A deep link wins over the remembered chapter.
    if (!this.followHash()) {
      const saved = Number(storageGet(STORAGE_KEY));
      const start = Number.isInteger(saved) && saved >= 0 && saved < chapters.length ? saved : 0;
      this.go(start, 0, { direction: 'jump', animate: false });
    }
  }

  /** Deep link `#<chapter>.<step>`, both 1-based (e.g. `#3.4`). Returns false if the hash is not one. */
  private followHash(): boolean {
    const link = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
    if (!link) return false;
    const ci = Math.min(this.chapters.length, Math.max(1, Number(link[1]))) - 1;
    const si = Math.min(this.chapters[ci].steps.length, Math.max(1, Number(link[2] ?? 1))) - 1;
    this.go(ci, si, { direction: 'jump', animate: false });
    return true;
  }

  // ---- navigation -------------------------------------------------------------

  private go(ci: number, si: number, info: EnterInfo): void {
    this.epoch++;
    this.ci = ci;
    this.si = si;
    this.subOverride = null;
    this.stages.forEach((s, i) => (s.hidden = i !== ci));
    storageSet(STORAGE_KEY, String(ci));
    const ch = this.chapters[ci];
    const step = ch.steps[si];
    this.captionEl.textContent = step.caption;
    this.captionEl.style.visibility = step.caption ? '' : 'hidden';
    this.captionEl.classList.remove('enter');
    void this.captionEl.offsetWidth; // restart the fade-in
    this.captionEl.classList.add('enter');
    this.renderSub();
    this.footnote.style.visibility = ch.showsStats ? '' : 'hidden';
    this.root.dataset.chapter = ch.id;
    this.progressEl.style.setProperty('--progress', String(this.progressFraction()));
    this.renderFooter();
    ch.enter(si, info);
  }

  private progressFraction(): number {
    const total = this.chapters.reduce((s, c) => s + c.steps.length, 0);
    const before = this.chapters.slice(0, this.ci).reduce((s, c) => s + c.steps.length, 0);
    return (before + this.si + 1) / total;
  }

  next(): void {
    const ch = this.chapters[this.ci];
    const animate = this.mode === 'show';
    if (this.si + 1 < ch.steps.length) this.go(this.ci, this.si + 1, { direction: 'forward', animate });
    else if (this.ci + 1 < this.chapters.length) this.go(this.ci + 1, 0, { direction: 'forward', animate });
  }

  prev(): void {
    if (this.si > 0) this.go(this.ci, this.si - 1, { direction: 'backward', animate: false });
    else if (this.ci > 0) {
      const ci = this.ci - 1;
      this.go(ci, this.chapters[ci].steps.length - 1, { direction: 'backward', animate: false });
    }
  }

  rerun(): void {
    this.go(this.ci, this.si, { direction: 'rerun', animate: this.mode === 'show' });
  }

  jump(ci: number): void {
    if (ci >= 0 && ci < this.chapters.length) this.go(ci, 0, { direction: 'jump', animate: this.mode === 'show' });
  }

  toggleMode(): void {
    this.mode = this.mode === 'show' ? 'fast' : 'show';
    this.renderFooter();
  }

  reseed(): void {
    this.runner.cancelAll();
    this.seed = randomSeed();
    for (const ch of this.chapters) ch.reseed?.();
    this.go(this.ci, this.si, { direction: 'rerun', animate: this.mode === 'show' });
  }

  toggleTheme(): void {
    const html = document.documentElement;
    const current =
      html.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    html.dataset.theme = current === 'dark' ? 'light' : 'dark';
  }

  toggleHelp(): void {
    this.help.hidden = !this.help.hidden;
  }

  // ---- rendering --------------------------------------------------------------

  private renderSub(): void {
    const text = this.subOverride ?? this.chapters[this.ci].steps[this.si].sub ?? '';
    this.subEl.textContent = text;
  }

  private renderFooter(): void {
    const ch = this.chapters[this.ci];
    const stepTxt = ch.steps.length > 1 ? ` · step ${this.si + 1}/${ch.steps.length}` : '';
    this.footerInfo.innerHTML = [
      `<span>${this.ci + 1}/${this.chapters.length} ${esc(ch.title)}${stepTxt}</span>`,
      `<span class="mode mode-${this.mode}">${this.mode === 'show' ? 'Show mode' : 'Fast mode'}</span>`,
      `<span>seed <code>${esc(this.seed)}</code></span>`,
      `<span>${formatInt(this.runner.totalSimulated)} games simulated</span>`,
    ].join('<span class="sep">·</span>');
  }

  // ---- keyboard ----------------------------------------------------------------

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && e.key !== 'Escape') {
      target.blur();
    }
    const k = e.key;
    const ch = this.chapters[this.ci];
    let handled = true;
    if (!this.help.hidden && k !== 'Escape') this.toggleHelp();
    switch (k) {
      case 'ArrowRight':
      case ' ':
      case 'PageDown':
        this.next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        this.prev();
        break;
      case 'Escape':
        this.toggleHelp();
        break;
      case '+':
      case '=':
      case 'ArrowUp':
        ch.adjust?.(+1);
        break;
      case '-':
      case '_':
      case 'ArrowDown':
        ch.adjust?.(-1);
        break;
      default: {
        const lower = k.toLowerCase();
        if (lower === 'r') this.rerun();
        else if (lower === 'f') this.toggleMode();
        else if (lower === 's') this.reseed();
        else if (lower === 't') this.toggleTheme();
        else if (/^[1-9]$/.test(k)) this.jump(Number(k) - 1);
        else handled = ch.onKey?.(lower) ?? false;
      }
    }
    if (handled) e.preventDefault();
  }
}
