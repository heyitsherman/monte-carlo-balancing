import { randomSeed } from '../core/rng';
import type { Runner } from '../core/runner';
import { formatInt } from '../core/stats';
import { sound } from './audio';
import { parseHash, parsePlaylist, playlistUrl } from './playlist';
import type { AppContext, Chapter, EnterInfo, Mode, SubOptions } from './types';
import { icon, MARK_SVG } from './icons';
import { LayoutCheck, reserveHeight } from './layout';
import { labUrl } from '../lab/labState';
import { el, esc, pageBase } from './util';

export const DEFAULT_SEED = 'dgt-balance';

const kbd = (k: string) => `<kbd>${k}</kbd>`;
const ARROW_RIGHT = kbd('<span class="arrow" role="img" aria-label="Right arrow"></span>');
const ARROW_LEFT = kbd('<span class="arrow arrow--back" role="img" aria-label="Left arrow"></span>');

/** Key rows for the help overlay: [keys as HTML, what they do]. */
function keyRows(chapterCount: number): [string, string][] {
  return [
    [`${ARROW_RIGHT} ${kbd('Space')} ${kbd('PgDn')}`, 'Next step'],
    [`${ARROW_LEFT} ${kbd('PgUp')}`, 'Previous step'],
    [kbd('R'), 'Re-run the current step'],
    [kbd('F'), 'Show mode or Fast mode'],
    [kbd('S'), 'New random seed'],
    [`${kbd('+')} ${kbd('−')}`, 'Adjust the active slider or switch'],
    [kbd('N'), 'Run 10× more games, when a verdict says “Not enough data”'],
    [chapterCount > 1 ? `${kbd('1')} to ${kbd(String(Math.min(9, chapterCount)))}` : kbd('1'), 'Jump to a chapter'],
    [kbd('O'), 'Overview: every chapter and step'],
    [kbd('L'), 'Open these rules in the Lab (a new tab)'],
    [kbd('M'), 'Sound on or off'],
    [kbd('T'), 'Light or dark theme'],
    [kbd('Esc'), 'Show or hide this help'],
  ];
}

const THEME_KEY = 'hih-theme';

/** The web build links to its one-file offline copy; the offline copy itself doesn't. */
const OFFLINE_LINK =
  import.meta.env.MODE === 'single'
    ? ''
    : '<p>No network at the venue? <a href="offline.html" download="run-it-10000-times.html">Download the offline copy</a>: one file that runs from a USB stick.</p>';

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
  private subOpts: SubOptions = {};
  /** The session's chapters, in playlist order. */
  private chapters: Chapter[];

  private captionEl: HTMLElement;
  private subEl: HTMLElement;
  private replayEl: HTMLElement;
  private stages: HTMLElement[] = [];
  private chapterEl: HTMLElement;
  private metaEl: HTMLElement;
  private footnote: HTMLElement;
  private help: HTMLElement;
  private overview: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private modeBtn: HTMLButtonElement;
  private progressEl: HTMLElement;
  private labBtn: HTMLButtonElement;
  private layoutCheck: LayoutCheck | null = null;
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
      setSub: (text, opts = {}) => {
        self.subOverride = text;
        self.subOpts = text === null ? {} : opts;
        self.renderSub();
      },
      setReplay: (text) => {
        // visibility (not display), and a no-break space when hidden, so the label never shifts the layout
        self.replayEl.textContent = text ?? ' ';
        self.replayEl.style.visibility = text ? '' : 'hidden';
      },
    };

    root.innerHTML = '';

    // Header band: neutral ink with the mark; Cobalt appears only as the progress strip (D12).
    const band = el('header', { class: 'band' });
    const bandInner = el('div', { class: 'band__inner' });
    const brand = el('div', { class: 'band__brand' });
    brand.innerHTML = `<span class="mark" aria-hidden="true">${MARK_SVG}</span><span class="band__title">Run it 10,000 times</span>`;
    this.chapterEl = el('div', { class: 'band__chapter' });
    const nav = el('nav', { class: 'band__nav', 'aria-label': 'Presenter controls' });
    const btn = (html: string, title: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', class: `icon-btn ${cls}`.trim(), title, 'aria-label': title }, html);
      b.addEventListener('click', () => {
        fn();
        b.blur();
      });
      return b;
    };
    this.modeBtn = btn(icon('fast'), 'Fast mode (F)', () => this.toggleMode());
    this.soundBtn = btn(icon('sound'), 'Sound (M)', () => sound.toggle(), 'sound-btn');
    this.labBtn = btn(icon('lab'), 'Open in the Lab (L)', () => this.openLab());
    nav.append(
      btn(icon('prev'), 'Previous step', () => this.prev()),
      btn(icon('next'), 'Next step', () => this.next()),
      btn(icon('rerun'), 'Re-run (R)', () => this.rerun()),
      this.modeBtn,
      btn(icon('overview'), 'Overview (O)', () => this.toggleOverview()),
      this.labBtn,
      this.soundBtn,
      btn(icon('theme'), 'Light or dark theme (T)', () => this.toggleTheme()),
      btn(icon('help'), 'Keys (Esc)', () => this.toggleHelp()),
    );
    bandInner.append(brand, this.chapterEl, nav);
    this.progressEl = el('div', { class: 'progress', 'aria-hidden': 'true' });
    band.append(bandInner, this.progressEl);

    this.captionEl = el('h2', { class: 'slide-caption', 'aria-live': 'polite' });
    this.subEl = el('p', { class: 'sub' });
    const stageWrap = el('main', { class: 'stage-wrap' });
    for (const ch of this.chapters) {
      const s = el('section', { class: 'stage', 'data-chapter': ch.id });
      s.hidden = true;
      stageWrap.append(s);
      this.stages.push(s);
      ch.mount(s, this.ctx);
    }

    // Footer: the statistics footnote, the replay label and the session meta share one row.
    this.footnote = el('div', { class: 'footnote' }, '± is a 95% confidence interval. Quadruple the runs to halve it.');
    this.replayEl = el('div', { class: 'replay', 'aria-live': 'polite' });
    this.replayEl.style.visibility = 'hidden';
    this.metaEl = el('div', { class: 'footer-meta' });
    const footer = el('footer', { class: 'footer' });
    footer.append(this.footnote, this.replayEl, this.metaEl);

    this.help = el('div', { class: 'overlay help', role: 'dialog', 'aria-label': 'Keyboard shortcuts' });
    this.help.innerHTML = `<div class="help-card"><h3>Keys</h3><dl class="keys">${keyRows(this.chapters.length)
      .map(([k, d]) => `<dt>${k}</dt><dd>${esc(d)}</dd>`)
      .join('')}</dl>
      <p>Mouse or touch: the buttons top right. Any key or click closes this.</p>
      ${OFFLINE_LINK}</div>`;
    this.help.hidden = true;
    this.help.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('a')) this.toggleHelp();
    });

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

    root.append(band, this.captionEl, this.subEl, stageWrap, footer, this.help, this.overview);

    // Keep the sub-line's height when a step swaps it mid-run; measure again on resize and once fonts are in.
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => this.reserveSub(), 150);
    });
    void document.fonts?.ready.then(() => {
      this.reserveSub();
      if (new URLSearchParams(location.search).has('layout-check')) {
        this.layoutCheck = new LayoutCheck(root, () => `${this.chapters[this.ci].id}.${this.si + 1}`);
        (window as unknown as { mcb: unknown }).mcb = { layoutChanges: () => this.layoutCheck!.changes() };
      }
    });

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
    this.subOpts = {};
    this.ctx.setReplay(null);
    this.stages.forEach((s, i) => (s.hidden = i !== ci));
    const ch = this.chapters[ci];
    const step = ch.steps[si];
    this.layoutCheck?.navigated();
    this.captionEl.textContent = step.caption;
    this.captionEl.style.visibility = step.caption ? '' : 'hidden';
    this.captionEl.classList.remove('enter');
    void this.captionEl.offsetWidth; // restart the fade-in
    this.captionEl.classList.add('enter');
    this.renderSub();
    this.reserveSub();
    this.footnote.style.visibility = ch.showsStats ? '' : 'hidden';
    this.root.dataset.chapter = ch.id;
    this.progressEl.style.setProperty('--progress', String(this.progressFraction()));
    this.renderFooter();
    ch.enter(si, info);
    this.labBtn.disabled = !ch.labLink?.();
  }

  /** L: this step's game and rules in the Lab, in a new tab so the talk keeps its place. */
  openLab(): void {
    const link = this.chapters[this.ci].labLink?.();
    if (!link) return;
    const url = labUrl(pageBase(), link.game, link.config as Record<string, unknown>, this.seed);
    window.open(url, '_blank', 'noopener');
  }

  /** The sub-line takes the height of the tallest text this step can show, so swapping it never moves the stage. */
  private reserveSub(): void {
    const step = this.chapters[this.ci].steps[this.si];
    const own = step.takeaway ? `Takeaway: ${step.takeaway}` : (step.sub ?? '');
    reserveHeight(this.subEl, [own, ...(step.subVariants ?? [])]);
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

  /** The OS decides; T stores an override, and choosing what the OS already prefers clears it. */
  toggleTheme(): void {
    const html = document.documentElement;
    const osDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const next = (html.dataset.theme ?? (osDark ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark';
    try {
      if ((next === 'dark') === osDark) {
        localStorage.removeItem(THEME_KEY);
        delete html.dataset.theme;
      } else {
        localStorage.setItem(THEME_KEY, next);
        html.dataset.theme = next;
      }
    } catch {
      html.dataset.theme = next;
    }
  }

  toggleHelp(): void {
    this.help.hidden = !this.help.hidden;
  }

  toggleOverview(): void {
    if (this.overview.hidden) this.renderOverview();
    this.overview.hidden = !this.overview.hidden;
  }

  // ---- rendering --------------------------------------------------------------

  /**
   * The sub-line: the step's own line, its takeaway (last step of a chapter), or a line a chapter
   * set while the step plays. Prompts (act now) get a Mustard bar, conclusions a Cobalt one.
   */
  private renderSub(): void {
    const step = this.chapters[this.ci].steps[this.si];
    let tone: SubOptions['tone'] = undefined;
    this.subEl.textContent = '';
    if (this.subOverride !== null) {
      this.subEl.textContent = this.subOverride;
      tone = this.subOpts.tone;
      const action = this.subOpts.action;
      if (action) {
        const b = el('button', { type: 'button', class: 'sub-action' }, esc(action.label));
        b.addEventListener('click', () => {
          b.blur();
          action.run();
        });
        this.subEl.append(' ', b);
      }
    } else if (step.takeaway) {
      this.subEl.innerHTML = `<strong>Takeaway:</strong> ${esc(step.takeaway)}`;
      tone = 'note';
    } else {
      this.subEl.textContent = step.sub ?? '';
      if (step.activity) tone = 'prompt';
    }
    this.subEl.classList.toggle('sub--prompt', tone === 'prompt');
    this.subEl.classList.toggle('sub--note', tone === 'note');
  }

  private renderFooter(): void {
    const ch = this.chapters[this.ci];
    const stepTxt = ch.steps.length > 1 ? `<span class="band__step">Step ${this.si + 1} of ${ch.steps.length}</span>` : '';
    this.chapterEl.innerHTML = `<span class="band__no">${this.ci + 1}</span><span class="band__name">${esc(ch.title)}</span>${stepTxt}`;
    this.metaEl.innerHTML = [
      `<span class="meta-mode">${this.mode === 'show' ? 'Show mode' : 'Fast mode'}</span>`,
      `<span>Seed <code>${esc(this.seed)}</code></span>`,
      `<span>${formatInt(this.runner.totalSimulated)} games simulated</span>`,
    ].join('');
    this.modeBtn.setAttribute('aria-pressed', String(this.mode === 'fast'));
    this.soundBtn.innerHTML = icon(sound.muted ? 'muted' : 'sound');
    this.soundBtn.setAttribute('aria-pressed', String(!sound.muted));
    const soundTitle = sound.muted ? 'Sound is off (M)' : 'Sound is on (M)';
    this.soundBtn.title = soundTitle;
    this.soundBtn.setAttribute('aria-label', soundTitle);
  }

  /** Every chapter of this session with its steps (click to jump), plus session links. */
  private renderOverview(): void {
    const base = pageBase();
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
          <h4><span class="ov-num">${ci + 1}</span> ${esc(ch.title)} <span class="ov-min">about ${ch.minutes} min</span></h4>
          <ol>${steps}</ol></section>`;
      })
      .join('');
    const inSession = new Set(this.chapters.map((c) => c.id));
    const others = this.library.filter((c) => !inSession.has(c.id));
    const othersHtml = others.length
      ? `<p class="ov-others">Other chapters: ${others
          .map((c) => `<a href="${esc(playlistUrl(base, [c.id]))}">${esc(c.title)}</a>`)
          .join(', ')}</p>`
      : '';
    this.overview.innerHTML = `<div class="help-card overview-card">
      <h3>This session: ${this.chapters.length} chapter${this.chapters.length === 1 ? '' : 's'}, about ${minutes} minutes</h3>
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
        else if (lower === 'l') this.openLab();
        else if (lower === 'm') sound.toggle();
        else if (/^[1-9]$/.test(k)) this.jump(Number(k) - 1);
        else handled = ch.onKey?.(lower) ?? false;
      }
    }
    if (handled) e.preventDefault();
  }
}
