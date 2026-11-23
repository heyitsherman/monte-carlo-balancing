import { randomSeed } from '../core/rng';
import type { Runner } from '../core/runner';
import { formatInt } from '../core/stats';
import { sound } from './audio';
import { parseHash, parsePlaylist, playlistUrl } from './playlist';
import type { AppContext, Chapter, EnterInfo, Mode } from './types';
import { el, esc } from './util';

export const DEFAULT_SEED = 'dgt-balance';

function keyRows(chapterCount: number): [string, string][] {
  return [
    ['→  Space  PgDn', 'Next step'],
    ['←  PgUp', 'Previous step'],
    ['R', 'Re-run current step'],
    ['F', 'Toggle Show / Fast mode'],
    ['S', 'Reseed (random)'],
    ['+  −', 'Adjust the active slider / toggle'],
    [chapterCount > 1 ? `1 – ${Math.min(9, chapterCount)}` : '1', 'Jump to chapter'],
    ['O', 'Overview: every chapter and step'],
    ['M', 'Sound on / off'],
    ['T', 'Toggle light / dark theme'],
    ['Esc', 'Show / hide this help'],
  ];
}

export interface PresenterOptions {
  /** Chapter ids shown when the URL has no `?set=` (the 5-minute talk). */
  defaultSet: string[];
}

/**
 * Chapter/step state machine, keyboard control, caption, footer, help and overview.
 * The session is a playlist of chapters from the library (`?set=duel,race`); only those
 * are mounted. Chapters are mounted once and kept alive; only the active one is visible.
 */
export class Presenter {
  private ci = 0;
  private si = 0;
  private mode: Mode = 'show';
  private seed = DEFAULT_SEED;
  private epoch = 0;
  private subOverride: string | null = null;
  /** The session's chapters, in playlist order. */
  private chapters: Chapter[];

  private captionEl: HTMLElement;
  private subEl: HTMLElement;
  private replayEl: HTMLElement;
  private stages: HTMLElement[] = [];
  private footerInfo: HTMLElement;
  private footnote: HTMLElement;
  private help: HTMLElement;
  private overview: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private progressEl: HTMLElement;
  readonly ctx: AppContext;

  constructor(
    private root: HTMLElement,
    private library: Chapter[],
    private runner: Runner,
    opts: PresenterOptions,
  ) {
    const playlist = parsePlaylist(
      location.search,
      library.map((c) => c.id),
      opts.defaultSet,
    );
    if (playlist.unknown.length) console.warn(`Unknown chapters ignored: ${playlist.unknown.join(', ')}`);
    this.chapters = playlist.ids.map((id) => library.find((c) => c.id === id)!);

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
      setReplay: (text) => {
        // visibility (not display) so the label never shifts the layout
        self.replayEl.textContent = text ?? '';
        self.replayEl.style.visibility = text ? '' : 'hidden';
      },
    };

    root.innerHTML = '';
    this.captionEl = el('h2', { class: 'caption', 'aria-live': 'polite' });
    this.subEl = el('p', { class: 'sub' });
    const stageWrap = el('main', { class: 'stage-wrap' });
    for (const ch of this.chapters) {
      const s = el('section', { class: 'stage', 'data-chapter': ch.id });
      s.hidden = true;
      stageWrap.append(s);
      this.stages.push(s);
      ch.mount(s, this.ctx);
    }
    this.footnote = el('div', { class: 'footnote' }, '± is a 95% confidence interval. Quadruple the runs to halve it.');
    // The replay label shares the footnote's row (right-aligned): that space is free on every screen.
    this.replayEl = el('div', { class: 'replay', 'aria-live': 'polite' });
    this.replayEl.style.visibility = 'hidden';
    const footRow = el('div', { class: 'footnote-row' });
    footRow.append(this.footnote, this.replayEl);
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
    this.soundBtn = btn('♪', 'Sound on / off (M)', () => sound.toggle());
    this.soundBtn.classList.add('sound-btn');
    nav.append(
      btn('◀', 'Previous step', () => this.prev()),
      btn('▶', 'Next step', () => this.next()),
      btn('R', 'Re-run', () => this.rerun()),
      btn('F', 'Toggle Show / Fast', () => this.toggleMode()),
      btn('O', 'Overview', () => this.toggleOverview()),
      this.soundBtn,
      btn('?', 'Keys', () => this.toggleHelp()),
    );
    footer.append(this.footerInfo, nav);

    this.help = el('div', { class: 'overlay help', role: 'dialog', 'aria-label': 'Keyboard shortcuts' });
    this.help.innerHTML = `<div class="help-card"><h3>Keys</h3><dl>${keyRows(this.chapters.length)
      .map(([k, d]) => `<dt>${esc(k)}</dt><dd>${esc(d)}</dd>`)
      .join('')}</dl><p>Mouse/touch: use the buttons bottom-right. Any key or click closes this.</p></div>`;
    this.help.hidden = true;
    this.help.addEventListener('click', () => this.toggleHelp());

    this.overview = el('div', { class: 'overlay overview', role: 'dialog', 'aria-label': 'Overview of chapters and steps' });
    this.overview.hidden = true;
    this.overview.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (b) {
        const [ci, si] = b.dataset.go!.split('.').map(Number);
        this.toggleOverview();
        this.go(ci, si, { direction: 'jump', animate: this.mode === 'show' });
      } else if (!(e.target as HTMLElement).closest('a, code')) {
        this.toggleOverview();
      }
    });

    root.append(this.captionEl, this.subEl, stageWrap, footRow, footer, this.progressEl, this.help, this.overview);

    runner.onSimulated = () => this.renderFooter();
    sound.onChange = () => this.renderFooter();
    // Browsers allow audio only after a gesture: unlock on the first key press or click.
    const unlock = () => sound.unlock();
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', (e) => this.onKey(e));

    window.addEventListener('hashchange', () => this.followHash());
    // Always open on the first chapter unless a deep link says otherwise.
    if (!this.followHash()) this.go(0, 0, { direction: 'jump', animate: false });
  }

  /** Deep link `#race.4` (chapter id) or `#3.4` (position in this session), step 1-based. */
  private followHash(): boolean {
    const t = parseHash(
      location.hash,
      this.chapters.map((c) => c.id),
      this.chapters.map((c) => c.steps.length),
    );
    if (!t) return false;
    this.go(t.chapter, t.step, { direction: 'jump', animate: false });
    return true;
  }

  // ---- navigation -------------------------------------------------------------

  private go(ci: number, si: number, info: EnterInfo): void {
    this.epoch++;
    this.ci = ci;
    this.si = si;
    this.subOverride = null;
    this.ctx.setReplay(null);
    this.stages.forEach((s, i) => (s.hidden = i !== ci));
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

  toggleOverview(): void {
    if (this.overview.hidden) this.renderOverview();
    this.overview.hidden = !this.overview.hidden;
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
    this.soundBtn.classList.toggle('muted', sound.muted);
    this.soundBtn.setAttribute('aria-pressed', String(!sound.muted));
    this.soundBtn.title = sound.muted ? 'Sound is off (M)' : 'Sound is on (M)';
  }

  /** Every chapter of this session with its steps (click to jump), plus session links. */
  private renderOverview(): void {
    const base = `${location.origin}${location.pathname}`;
    const minutes = this.chapters.reduce((s, c) => s + c.minutes, 0);
    const cards = this.chapters
      .map((ch, ci) => {
        const steps = ch.steps
          .map((st, si) => {
            const current = ci === this.ci && si === this.si ? ' aria-current="step"' : '';
            return `<li><button type="button" data-go="${ci}.${si}"${current}>${esc(st.caption || ch.title)}</button></li>`;
          })
          .join('');
        return `<section class="ov-chapter">
          <h4><span class="ov-num">${ci + 1}</span> ${esc(ch.title)} <span class="ov-min">≈ ${ch.minutes} min</span></h4>
          <ol>${steps}</ol></section>`;
      })
      .join('');
    const inSession = new Set(this.chapters.map((c) => c.id));
    const others = this.library.filter((c) => !inSession.has(c.id));
    const othersHtml = others.length
      ? `<p class="ov-others">Other chapters: ${others
          .map((c) => `<a href="${esc(playlistUrl(base, [c.id]))}">${esc(c.title)}</a>`)
          .join(' · ')}</p>`
      : '';
    this.overview.innerHTML = `<div class="help-card overview-card">
      <h3>This session · ${this.chapters.length} chapter${this.chapters.length === 1 ? '' : 's'} · ≈ ${minutes} min</h3>
      <div class="ov-grid">${cards}</div>
      <p class="ov-link">Session link: <code>${esc(playlistUrl(base, this.chapters.map((c) => c.id)))}</code></p>
      ${othersHtml}
      <p>Click a step to jump there. Any key closes this.</p></div>`;
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
    // While an overlay is open, any key just closes it (and does nothing else).
    if (!this.help.hidden || !this.overview.hidden) {
      this.help.hidden = true;
      this.overview.hidden = true;
      e.preventDefault();
      return;
    }
    let handled = true;
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
        else if (lower === 'o') this.toggleOverview();
        else if (lower === 'm') sound.toggle();
        else if (/^[1-9]$/.test(k)) this.jump(Number(k) - 1);
        else handled = ch.onKey?.(lower) ?? false;
      }
    }
    if (handled) e.preventDefault();
  }
}
