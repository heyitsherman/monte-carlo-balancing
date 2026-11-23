/**
 * The Lab (`?lab`): students change a game's rules and run it, with no code. Everything here is generic:
 * controls come from each game's setting descriptions, the table and charts from its metric descriptions,
 * and the presets from its preset list, so a new game appears in the Lab without any Lab code.
 *
 * It follows the talk's rules: an explicit run (Run, R, N) plays the paced build-up and says so; changing a
 * setting updates at once (plan D8); the same sounds and mute (D9); and the same "Not enough data" prompt.
 */
import { showBatches, stableStringify } from '../core/engine';
import { estimate, type MetricEstimate } from '../core/metrics';
import { randomSeed } from '../core/rng';
import { isCancelled, type Runner } from '../core/runner';
import {
  assess,
  formatInt,
  meanInterval,
  type Assessment,
  type Interval,
  type Target,
} from '../core/stats';
import { getGame } from '../games/registry';
import type { AnyGame, MetricSpec, ParamSpec } from '../games/types';
import { sound } from '../ui/audio';
import { addingLabel, playBuildUp } from '../ui/buildUp';
import { renderDotSweep, type DotPoint, type DotSweepData } from '../ui/charts/dotSweep';
import { renderHeatmap, type HeatmapData } from '../ui/charts/heatmap';
import { renderHistogram, type HistogramData } from '../ui/charts/histogram';
import { ChartHost } from '../ui/charts/host';
import { icon, MARK_SVG } from '../ui/icons';
import { LayoutCheck } from '../ui/layout';
import { stillUnclearLine, unclearPrompt } from '../ui/targetNotes';
import type { AppContext } from '../ui/types';
import { el, esc, fx, pageBase } from '../ui/util';
import {
  DEFAULT_LAB_SEED,
  decodeLab,
  defaultState,
  differences,
  encodeLab,
  isRelevant,
  LAB_GAMES,
  LAB_RUNS,
  MAX_RUNS,
  sweepableMetrics,
  sweepValues,
  validValue,
  valueLabel,
  type Config,
  type LabState,
} from './labState';
import { detectable, diffMean, diffProportion, meanSd, proportionSd, runsToDetect, toCsv, type Difference } from './labStats';

const NOUN = { one: 'run', many: 'runs' };
const THEME_KEY = 'hih-theme';
/** Settings changes wait this long before re-running, so dragging a slider doesn't queue a run per pixel. */
const DEBOUNCE_MS = 150;
/** 2D sweeps cap each cell at this many runs, so a 7 × 7 grid stays quick. */
const SWEEP_2D_MAX = 10_000;

type SetName = 'A' | 'B';
interface RuleSet {
  name: SetName;
  config: Config;
}

/** A metric's estimate, ready to show. */
interface Shown {
  est: MetricEstimate;
  /** The estimate as a range (null for a distribution). */
  range: Interval | null;
  big: string;
  small: string;
  exact: string;
  assessment: Assessment | null;
}

const pct = (x: number, d = 1) => `${fx(x * 100, d)}%`;

/** A tidy axis for a set of values: padded, rounded to a step that gives about 5 gridlines. */
function niceAxis(values: number[], proportion: boolean): { min: number; max: number; step: number } {
  const v = values.filter(Number.isFinite);
  let lo = v.length ? Math.min(...v) : 0;
  let hi = v.length ? Math.max(...v) : 1;
  if (hi - lo < 1e-9) {
    lo -= proportion ? 0.05 : Math.max(0.5, Math.abs(lo) * 0.1);
    hi += proportion ? 0.05 : Math.max(0.5, Math.abs(hi) * 0.1);
  }
  const pad = (hi - lo) * 0.2;
  lo -= pad;
  hi += pad;
  if (proportion) {
    lo = Math.max(0, lo);
    hi = Math.min(1, hi);
  }
  const raw = (hi - lo) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

export class Lab {
  private state: LabState;
  private game: AnyGame;
  private editing: SetName = 'A';
  private epoch = 0;
  private debounce = 0;
  private cache = new Map<string, Promise<unknown>>();
  private exactCache = new Map<string, Promise<unknown>>();
  /** The selected metric reads "Not enough data" after the last run, so N may run 10× more. */
  private canRunMore = false;
  /** The last run was a "10× more" run (its prompt says what happened). */
  private ranMore = false;
  private layoutCheck: LayoutCheck | null = null;
  private ctx: AppContext;

  // DOM
  private gameSel!: HTMLSelectElement;
  private presetSel!: HTMLSelectElement;
  private blurb!: HTMLElement;
  private compare!: HTMLInputElement;
  private abSeg!: HTMLElement;
  private paramsEl!: HTMLElement;
  private diffEl!: HTMLElement;
  private nSeg!: HTMLElement;
  private seedInput!: HTMLInputElement;
  private tabs!: HTMLElement;
  private resultsView!: HTMLElement;
  private sweepView!: HTMLElement;
  private bigEl!: HTMLElement;
  private noteEl!: HTMLElement;
  private tableEl!: HTMLTableElement;
  private methodEl!: HTMLElement;
  private calcEl!: HTMLElement;
  private replayEl!: HTMLElement;
  private xSel!: HTMLSelectElement;
  private ySel!: HTMLSelectElement;
  private metricSel!: HTMLSelectElement;
  private sweepMethod!: HTMLElement;
  private soundBtn!: HTMLButtonElement;
  private chart!: ChartHost<DotSweepData>;
  private hist!: ChartHost<HistogramData>;
  private sweepDots!: ChartHost<DotSweepData>;
  private heat!: ChartHost<HeatmapData>;
  private lastResults: { sets: RuleSet[]; shown: Shown[][] } | null = null;
  private lastSweep: (string | number | boolean | null)[][] | null = null;

  constructor(
    private root: HTMLElement,
    private runner: Runner,
  ) {
    this.state = decodeLab(location.search);
    this.game = getGame(this.state.game);
    const self = this;
    this.ctx = {
      get seed() {
        return self.state.seed;
      },
      mode: 'show',
      runner,
      get epoch() {
        return self.epoch;
      },
      alive: (e) => e === self.epoch,
      wait: (ms, e) => new Promise((r) => setTimeout(() => r(e === self.epoch), ms)),
      setSub: () => {},
      setReplay: (text) => {
        self.replayEl.textContent = text ?? ' ';
        self.replayEl.style.visibility = text ? '' : 'hidden';
      },
    };
    document.documentElement.classList.add('is-lab');
    document.title = 'Lab · Run it 10,000 times';
    this.build();
    this.renderInputs();
    this.syncView();
    window.addEventListener('keydown', (e) => this.onKey(e));
    const unlock = () => sound.unlock();
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('pointerdown', unlock, { capture: true });
    sound.onChange = () => this.renderSoundBtn();
    void document.fonts?.ready.then(() => {
      if (new URLSearchParams(location.search).has('layout-check')) {
        this.layoutCheck = new LayoutCheck(root, () => `lab.${this.state.view}`);
        (window as unknown as { mcb: unknown }).mcb = { layoutChanges: () => this.layoutCheck!.changes() };
      }
    });
    this.refresh('instant');
  }

  // ---- building the page ------------------------------------------------------------------------

  private build(): void {
    const root = this.root;
    root.innerHTML = '';
    root.classList.add('lab-app');
    const talk = pageBase();

    const band = el('header', { class: 'band' });
    const inner = el('div', { class: 'band__inner' });
    inner.innerHTML = `<div class="band__brand"><span class="mark" aria-hidden="true">${MARK_SVG}</span><span class="band__title">Run it 10,000 times</span></div>
      <div class="band__chapter"><span class="band__name">Lab</span></div>`;
    const nav = el('nav', { class: 'band__nav', 'aria-label': 'Lab controls' });
    const btn = (html: string, title: string, fn: () => void) => {
      const b = el('button', { type: 'button', class: 'icon-btn', title, 'aria-label': title }, html);
      b.addEventListener('click', () => {
        fn();
        b.blur();
      });
      return b;
    };
    this.soundBtn = btn(icon('sound'), 'Sound (M)', () => sound.toggle());
    const back = el('a', { class: 'icon-btn', href: talk, title: 'Back to the talk', 'aria-label': 'Back to the talk' }, icon('prev'));
    nav.append(back, btn(icon('rerun'), 'Run (R)', () => this.run()), this.soundBtn, btn(icon('theme'), 'Light or dark theme (T)', () => this.toggleTheme()));
    inner.append(nav);
    band.append(inner, el('div', { class: 'progress lab-strip', 'aria-hidden': 'true' }));

    const main = el('main', { class: 'lab' });
    main.innerHTML = `
      <p class="lab-lead">Pick a game, change its rules and run it thousands of times. Compare two rule sets, or sweep a setting to see where it lands on its target.
        <span class="lab-keys">Keys: <kbd>R</kbd> run, <kbd>N</kbd> 10× more, <kbd>M</kbd> sound, <kbd>T</kbd> theme.</span></p>
      <div class="lab-grid">
        <section class="lab-inputs" aria-label="Rules">
          <label class="lab-field"><span class="lab-field-label">Game</span><select class="lab-game">${LAB_GAMES.map(
            (g) => `<option value="${g.id}">${esc(g.name)}</option>`,
          ).join('')}</select></label>
          <label class="lab-field"><span class="lab-field-label">Preset</span><select class="lab-preset"></select></label>
          <p class="lab-blurb"></p>
          <label class="ctl switch lab-compare"><input type="checkbox" aria-label="Compare with a second rule set"><span class="knob"></span><span class="ctl-name">Compare with rules B</span></label>
          <div class="seg lab-ab" role="group" aria-label="Rule set you are editing">
            <button type="button" data-ab="A" aria-pressed="true">Editing rules A</button><button type="button" data-ab="B" aria-pressed="false">Editing rules B</button>
          </div>
          <div class="lab-params"></div>
          <p class="lab-diff"></p>
          <div class="lab-runbox">
            <div class="lab-field"><span class="lab-field-label" id="lab-n-label">Runs per rule set</span>
              <div class="seg lab-n" role="group" aria-labelledby="lab-n-label">${LAB_RUNS.map(
                (n) => `<button type="button" data-n="${n}">${formatInt(n)}</button>`,
              ).join('')}</div></div>
            <label class="lab-field"><span class="lab-field-label">Seed</span>
              <span class="lab-seed-row"><input class="lab-seed" type="text" spellcheck="false" autocomplete="off" maxlength="40" aria-label="Seed: the same seed gives the same numbers">
              <button type="button" class="button button--secondary lab-newseed">New seed</button></span></label>
            <button type="button" class="button lab-run">Run (R)</button>
          </div>
        </section>
        <section class="lab-results" aria-label="Results">
          <div class="lab-tabbar">
            <div class="seg lab-tabs" role="group" aria-label="View">
              <button type="button" data-view="results">Results</button><button type="button" data-view="sweep">Sweep a setting</button>
            </div>
            <span class="replay lab-replay" aria-live="polite"> </span>
          </div>
          <div class="lab-view lab-view--results">
            <div class="lab-big"></div>
            <p class="lab-note"></p>
            <div class="table-wrap"><table class="data-table lab-table"></table></div>
            <div class="chart-host lab-chart"></div>
            <div class="chart-host lab-hist"></div>
            <p class="lab-method"></p>
            <p class="lab-calc"></p>
            <div class="lab-actions"><button type="button" class="button button--secondary lab-csv">Download CSV</button></div>
          </div>
          <div class="lab-view lab-view--sweep">
            <div class="lab-sweep-controls">
              <label class="lab-field"><span class="lab-field-label">Sweep</span><select class="lab-x"></select></label>
              <label class="lab-field"><span class="lab-field-label">Against</span><select class="lab-y"></select></label>
              <label class="lab-field"><span class="lab-field-label">Measure</span><select class="lab-metric"></select></label>
            </div>
            <div class="chart-host lab-sweep-chart"></div>
            <div class="chart-host lab-heat"></div>
            <p class="lab-method lab-sweep-method"></p>
            <div class="lab-actions"><button type="button" class="button button--secondary lab-sweep-csv">Download CSV</button></div>
          </div>
        </section>
      </div>`;
    root.append(band, main);

    const q = <T extends Element>(sel: string) => main.querySelector<T & HTMLElement>(sel)! as T;
    this.gameSel = q<HTMLSelectElement>('.lab-game');
    this.presetSel = q<HTMLSelectElement>('.lab-preset');
    this.blurb = q('.lab-blurb');
    this.compare = q<HTMLInputElement>('.lab-compare input');
    this.abSeg = q('.lab-ab');
    this.paramsEl = q('.lab-params');
    this.diffEl = q('.lab-diff');
    this.nSeg = q('.lab-n');
    this.seedInput = q<HTMLInputElement>('.lab-seed');
    this.tabs = q('.lab-tabs');
    this.resultsView = q('.lab-view--results');
    this.sweepView = q('.lab-view--sweep');
    this.bigEl = q('.lab-big');
    this.noteEl = q('.lab-note');
    this.tableEl = q<HTMLTableElement>('.lab-table');
    this.methodEl = q('.lab-view--results .lab-method');
    this.calcEl = q('.lab-calc');
    this.replayEl = q('.lab-replay');
    this.replayEl.style.visibility = 'hidden';
    this.xSel = q<HTMLSelectElement>('.lab-x');
    this.ySel = q<HTMLSelectElement>('.lab-y');
    this.metricSel = q<HTMLSelectElement>('.lab-metric');
    this.sweepMethod = q('.lab-sweep-method');
    this.chart = new ChartHost(q('.lab-chart'), renderDotSweep);
    this.hist = new ChartHost(q('.lab-hist'), renderHistogram);
    this.sweepDots = new ChartHost(q('.lab-sweep-chart'), renderDotSweep);
    this.heat = new ChartHost(q('.lab-heat'), renderHeatmap);

    this.gameSel.addEventListener('change', () => this.setGame(this.gameSel.value));
    this.presetSel.addEventListener('change', () => this.applyPreset(this.presetSel.value));
    this.compare.addEventListener('change', () => this.setCompare(this.compare.checked));
    this.abSeg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ab]');
      if (b && this.state.b) this.setEditing(b.dataset.ab as SetName);
    });
    this.nSeg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
      if (!b) return;
      this.state.n = Number(b.dataset.n);
      this.changed();
    });
    this.seedInput.addEventListener('change', () => {
      const v = this.seedInput.value.trim();
      this.setSeed(/^[\w-]{1,40}$/.test(v) ? v : DEFAULT_LAB_SEED);
    });
    q('.lab-newseed').addEventListener('click', () => this.setSeed(randomSeed()));
    q('.lab-run').addEventListener('click', () => this.run());
    this.tabs.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-view]');
      if (!b) return;
      this.state.view = b.dataset.view as LabState['view'];
      this.layoutCheck?.navigated();
      this.syncView();
      this.refresh('instant');
    });
    this.tableEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-metric]');
      if (!b) return;
      this.state.metric = b.dataset.metric!;
      this.syncUrl();
      this.refresh('instant');
    });
    this.calcEl.addEventListener('input', () => this.renderCalc());
    for (const sel of [this.xSel, this.ySel, this.metricSel]) {
      sel.addEventListener('change', () => {
        this.state.sweepX = this.xSel.value;
        this.state.sweepY = this.ySel.value || null;
        if (this.state.sweepY === this.state.sweepX) this.state.sweepY = null;
        this.state.metric = this.metricSel.value;
        this.layoutCheck?.navigated();
        this.renderSweepControls();
        this.changed();
      });
    }
    q('.lab-csv').addEventListener('click', () => this.downloadResults());
    q('.lab-sweep-csv').addEventListener('click', () => this.downloadSweep());
    this.renderSoundBtn();
  }

  // ---- inputs -------------------------------------------------------------------------------------

  private get edited(): Config {
    return this.editing === 'B' && this.state.b ? this.state.b : this.state.a;
  }

  private renderInputs(): void {
    const g = this.game;
    this.gameSel.value = g.id;
    const presets = g.presets ?? [];
    this.presetSel.innerHTML = `<option value="">Your own rules</option>${presets
      .map((p) => `<option value="${p.id}">${esc(p.label)}</option>`)
      .join('')}`;
    this.presetSel.disabled = presets.length === 0;
    this.compare.checked = !!this.state.b;
    this.abSeg.hidden = !this.state.b;
    for (const b of this.abSeg.querySelectorAll<HTMLElement>('[data-ab]')) b.setAttribute('aria-pressed', String(b.dataset.ab === this.editing));
    for (const b of this.nSeg.querySelectorAll<HTMLElement>('[data-n]')) b.setAttribute('aria-pressed', String(Number(b.dataset.n) === this.state.n));
    this.seedInput.value = this.state.seed;
    this.renderParams();
    this.renderSweepControls();
  }

  private renderParams(): void {
    const cfg = this.edited;
    const other = this.state.b ? (this.editing === 'B' ? this.state.a : this.state.b) : null;
    this.paramsEl.innerHTML = this.game.params
      .map((p) => {
        const id = `lp-${p.key}`;
        const v = cfg[p.key];
        const hidden = isRelevant(p, cfg) ? '' : ' hidden';
        const differs = other && other[p.key] !== v ? `<span class="lp-other">${this.editing === 'B' ? 'A' : 'B'}: ${esc(valueLabel(p, other[p.key]))}</span>` : '';
        const help = p.help ? `<p class="lp-help">${esc(p.help)}</p>` : '';
        if (p.kind === 'int') {
          return `<div class="lp" data-key="${p.key}"${hidden}>
            <div class="lp-head"><label class="lp-name" for="${id}">${esc(p.label)}</label>${differs}</div>
            <div class="lp-row">
              <button type="button" class="lp-step" data-d="-1" aria-label="${esc(p.label)}: less">−</button>
              <input type="range" id="${id}" min="${p.min}" max="${p.max}" step="${p.step ?? 1}" value="${v}">
              <button type="button" class="lp-step" data-d="1" aria-label="${esc(p.label)}: more">+</button>
              <output class="lp-val" for="${id}">${v}</output><span class="lp-unit">${esc(p.unit ?? '')}</span>
            </div>${help}</div>`;
        }
        if (p.kind === 'toggle') {
          return `<div class="lp" data-key="${p.key}"${hidden}>
            <div class="lp-head"><label class="ctl switch lp-switch"><input type="checkbox" id="${id}"${v ? ' checked' : ''}><span class="knob"></span><span class="lp-name">${esc(p.label)}</span></label>${differs}</div>${help}</div>`;
        }
        return `<div class="lp" data-key="${p.key}"${hidden}>
          <div class="lp-head"><label class="lp-name" for="${id}">${esc(p.label)}</label>${differs}</div>
          <select id="${id}">${p.options.map((o) => `<option value="${esc(o.value)}"${o.value === v ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${help}</div>`;
      })
      .join('');
    for (const row of this.paramsEl.querySelectorAll<HTMLElement>('.lp')) {
      const p = this.game.params.find((x) => x.key === row.dataset.key)!;
      const input = row.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
      input.addEventListener(p.kind === 'int' ? 'input' : 'change', () => {
        const raw = p.kind === 'int' ? Number(input.value) : p.kind === 'toggle' ? (input as HTMLInputElement).checked : input.value;
        this.setParam(p, raw);
      });
      for (const b of row.querySelectorAll<HTMLElement>('.lp-step')) {
        b.addEventListener('click', () => {
          if (p.kind === 'int') this.setParam(p, (this.edited[p.key] as number) + Number(b.dataset.d) * (p.step ?? 1));
        });
      }
    }
    this.renderPresetMatch();
    this.renderDiff();
  }

  private setParam(p: ParamSpec, raw: unknown): void {
    const cfg = this.edited;
    const v = validValue(p, raw, cfg[p.key]);
    if (v === cfg[p.key]) return;
    cfg[p.key] = v;
    // Choices can show or hide dependent settings; everything else updates in place.
    if (p.kind === 'choice' || this.state.b) this.renderParams();
    else {
      const row = this.paramsEl.querySelector<HTMLElement>(`.lp[data-key="${p.key}"]`)!;
      const out = row.querySelector('output');
      if (out) out.textContent = String(v);
      const range = row.querySelector<HTMLInputElement>('input[type=range]');
      if (range && Number(range.value) !== v) range.value = String(v);
      this.renderPresetMatch();
    }
    this.changed();
  }

  /** The preset the edited rules match exactly, if any, with its lesson. */
  private renderPresetMatch(): void {
    const g = this.game;
    const cfg = this.edited;
    const match = (g.presets ?? []).find((p) => g.params.every((s) => ({ ...g.defaultConfig, ...p.config })[s.key] === cfg[s.key]));
    this.presetSel.value = match?.id ?? '';
    this.blurb.textContent = match ? match.blurb : 'Change any setting, or pick a preset: each one teaches one thing.';
  }

  private renderDiff(): void {
    const { a, b } = this.state;
    if (!b) {
      this.diffEl.textContent = '';
      this.diffEl.hidden = true;
      return;
    }
    const diffs = differences(this.game, a, b);
    this.diffEl.hidden = false;
    this.diffEl.textContent = diffs.length
      ? `Rules B differ in: ${diffs.map((p) => `${p.label} ${valueLabel(p, a[p.key])} → ${valueLabel(p, b[p.key])}`).join('; ')}.`
      : 'Rules B are the same as A so far: change a setting while editing B.';
  }

  private applyPreset(id: string): void {
    const p = this.game.presets?.find((x) => x.id === id);
    if (!p) return;
    const next = { ...this.game.defaultConfig, ...p.config };
    for (const s of this.game.params) this.edited[s.key] = next[s.key];
    this.renderParams();
    this.changed();
  }

  private setGame(id: string): void {
    const seed = this.state.seed;
    const n = this.state.n;
    const view = this.state.view;
    this.state = { ...defaultState(id), seed, n, view };
    this.game = getGame(id);
    this.editing = 'A';
    this.layoutCheck?.navigated();
    this.renderInputs();
    this.changed(true);
  }

  private setCompare(on: boolean): void {
    this.state.b = on ? { ...this.state.a } : null;
    this.editing = on ? 'B' : 'A';
    this.layoutCheck?.navigated();
    this.renderInputs();
    this.changed(true);
  }

  private setEditing(name: SetName): void {
    this.editing = name;
    this.layoutCheck?.navigated();
    this.renderInputs();
  }

  private setSeed(seed: string): void {
    this.state.seed = seed;
    this.seedInput.value = seed;
    this.cache.clear();
    this.changed(true);
  }

  private renderSweepControls(): void {
    const g = this.game;
    const opt = (p: ParamSpec) => `<option value="${p.key}">${esc(p.label)}</option>`;
    this.xSel.innerHTML = g.params.map(opt).join('');
    this.xSel.value = this.state.sweepX ?? g.params[0].key;
    this.state.sweepX = this.xSel.value;
    this.ySel.innerHTML = `<option value="">Nothing: one setting</option>${g.params.filter((p) => p.key !== this.state.sweepX).map(opt).join('')}`;
    this.ySel.value = this.state.sweepY ?? '';
    const ms = sweepableMetrics(g);
    this.metricSel.innerHTML = ms.map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
    this.metricSel.value = ms.some((m) => m.id === this.state.metric) ? this.state.metric : ms[0].id;
  }

  private syncView(): void {
    const v = this.state.view;
    for (const b of this.tabs.querySelectorAll<HTMLElement>('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === v));
    this.resultsView.hidden = v !== 'results';
    this.sweepView.hidden = v !== 'sweep';
    this.syncUrl();
  }

  private syncUrl(): void {
    const keep = new URLSearchParams(location.search).has('layout-check') ? '&layout-check' : '';
    history.replaceState(null, '', `${location.pathname}?${encodeLab(this.state)}${keep}`);
  }

  /** Something changed: update the URL and, after a short pause, the results (at once, no build-up). */
  private changed(now = false): void {
    for (const b of this.nSeg.querySelectorAll<HTMLElement>('[data-n]')) b.setAttribute('aria-pressed', String(Number(b.dataset.n) === this.state.n));
    this.renderDiff();
    this.syncUrl();
    clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => this.refresh('instant'), now ? 0 : DEBOUNCE_MS);
  }

  // ---- running ------------------------------------------------------------------------------------

  private sets(): RuleSet[] {
    return this.state.b ? [{ name: 'A', config: this.state.a }, { name: 'B', config: this.state.b }] : [{ name: 'A', config: this.state.a }];
  }

  private key(config: Config, n: number): string {
    return `${this.game.id}|${this.state.seed}|${n}|${stableStringify(config)}`;
  }

  private agg(config: Config, n: number): Promise<unknown> {
    const k = this.key(config, n);
    let p = this.cache.get(k);
    if (!p) {
      p = this.runner.run(this.game.id, config, n, this.state.seed);
      const pp = p;
      p.catch(() => this.cache.get(k) === pp && this.cache.delete(k));
      this.cache.set(k, p);
    }
    return p;
  }

  private exact(config: Config): Promise<unknown> {
    if (!this.game.exact) return Promise.resolve(null);
    const k = `${this.game.id}|${stableStringify(config)}`;
    let p = this.exactCache.get(k);
    if (!p) {
      p = this.runner.exact(this.game.id, config).catch(() => null);
      this.exactCache.set(k, p);
    }
    return p;
  }

  /** R / the Run button: an explicit run plays the paced build-up (plan D8). */
  private run(): void {
    this.refresh('buildup');
  }

  private refresh(mode: 'instant' | 'buildup' | 'more'): void {
    clearTimeout(this.debounce);
    const epoch = ++this.epoch;
    this.ctx.setReplay(null);
    const job = this.state.view === 'results' ? this.runResults(mode, epoch) : this.runSweep(mode === 'instant' ? 'instant' : 'reveal', epoch);
    job.catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  private async runResults(mode: 'instant' | 'buildup' | 'more', epoch: number): Promise<void> {
    const sets = this.sets();
    const exacts = await Promise.all(sets.map((s) => this.exact(s.config)));
    if (epoch !== this.epoch) return;
    this.ranMore = mode === 'more';
    if (mode === 'instant') {
      const aggs = await Promise.all(sets.map((s) => this.agg(s.config, this.state.n)));
      if (epoch !== this.epoch) return;
      this.renderResults(sets, aggs, exacts, true);
      return;
    }
    const prevN = this.state.n;
    if (mode === 'more') {
      this.state.n = Math.min(MAX_RUNS, prevN * 10);
      this.changedQuietly();
    }
    const n = this.state.n;
    const checkpoints = mode === 'more' ? [prevN * 2, prevN * 5] : showBatches(n);
    const snaps: unknown[][] = sets.map(() => []);
    const finals = await Promise.all(
      sets.map((s, i) => {
        const p = this.runner.run(this.game.id, s.config, n, this.state.seed, (pr) => pr.checkpoint && snaps[i].push(pr.aggregate), { checkpoints });
        this.cache.set(this.key(s.config, n), p);
        return p;
      }),
    );
    if (epoch !== this.epoch) return;
    const firsts = mode === 'more' ? await Promise.all(sets.map((s) => this.agg(s.config, prevN))) : null;
    // One frame per checkpoint (runs so far), plus the runs already on screen when adding 10× more.
    const steps = checkpoints.filter((c) => c < n);
    const sizes = [...(firsts ? [prevN] : []), ...steps, n];
    const frames = sizes.map((size, f) => {
      const k = firsts ? f - 1 : f;
      const data = sets.map((_, i) => (k < 0 ? firsts![i] : k < steps.length ? snaps[i][k] ?? finals[i] : finals[i]));
      return { n: size, data };
    });
    const last = frames[frames.length - 1].data;
    const done = await playBuildUp(this.ctx, epoch, frames, (aggs) => this.renderResults(sets, aggs, exacts, aggs === last), {
      noun: NOUN,
      tweenMs: 0,
      holdMs: mode === 'more' ? 800 : 650,
      label: mode === 'more' ? (k) => addingLabel(k, n, NOUN) : undefined,
    });
    if (done) sound.verdict();
  }

  /** The run count changed by itself (N): update its buttons and the URL, without re-running. */
  private changedQuietly(): void {
    for (const b of this.nSeg.querySelectorAll<HTMLElement>('[data-n]')) b.setAttribute('aria-pressed', String(Number(b.dataset.n) === this.state.n));
    this.syncUrl();
  }

  // ---- results ------------------------------------------------------------------------------------

  private show(metric: MetricSpec<unknown, unknown>, agg: unknown, exact: unknown): Shown {
    const est = estimate(metric, agg, exact);
    const target: Target | undefined = metric.kind !== 'distribution' ? metric.target : undefined;
    if (est.kind === 'proportion') {
      const v = est.value;
      return {
        est,
        range: v,
        big: pct(v.p),
        small: `± ${fx(v.marginPP)} pp`,
        exact: est.exact !== null ? pct(est.exact, 2) : '',
        assessment: target ? assess(v, target) : null,
      };
    }
    if (est.kind === 'mean') {
      const v = est.value;
      const unit = metric.kind === 'mean' ? metric.unit : '';
      const r = meanInterval(v);
      const enough = v.n > 1;
      return {
        est,
        range: enough ? r : null,
        big: fx(v.mean, 2),
        small: enough ? `± ${fx(v.margin, 2)} ${unit}` : unit,
        exact: est.exact !== null ? fx(est.exact, 2) : '',
        assessment: target && enough ? assess(r, target) : null,
      };
    }
    const mean = est.value.reduce((s, f, i) => s + f * i, 0);
    const exMean = est.exact ? est.exact.reduce((s, f, i) => s + f * i, 0) : NaN;
    return { est, range: null, big: fx(mean, 2), small: 'average', exact: Number.isFinite(exMean) ? fx(exMean, 2) : '', assessment: null };
  }

  private renderResults(sets: RuleSet[], aggs: unknown[], exacts: unknown[], final: boolean): void {
    const g = this.game;
    if (!g.metrics.some((m) => m.id === this.state.metric)) this.state.metric = g.metrics[0].id;
    const shown = g.metrics.map((m) => sets.map((_, i) => this.show(m, aggs[i], exacts[i])));
    this.lastResults = { sets, shown };
    const mi = g.metrics.findIndex((m) => m.id === this.state.metric);
    const metric = g.metrics[mi];
    const sel = shown[mi];
    const n = this.runsOf(aggs[0]);

    // Big numbers: the selected measure for each rule set, and the difference.
    const verdictChip = (a: Assessment | null) =>
      a ? `<span class="verdict lab-verdict ${a.status === 'on' ? 'fair' : a.status === 'unclear' ? 'unclear' : 'off'}">${esc(a.label)}</span>` : '';
    const blocks = sets.map(
      (s, i) => `<div class="lab-stat lab-stat--${s.name.toLowerCase()}"><div class="ls-label">${esc(metric.label)}, rules ${s.name}</div>
        <div class="ls-big">${sel[i].big}</div><div class="ls-small">${esc(sel[i].small)}${sel[i].exact ? ` · <span class="exact-inline">math: ${sel[i].exact}</span>` : ''}</div>${verdictChip(sel[i].assessment)}</div>`,
    );
    const diff = sets.length === 2 ? this.diffOf(sel[0].est, sel[1].est) : null;
    if (diff) {
      const isP = sel[0].est.kind === 'proportion';
      const fmt = (x: number) => (isP ? `${x >= 0 ? '+' : '−'}${fx(Math.abs(x) * 100)} pp` : `${x >= 0 ? '+' : '−'}${fx(Math.abs(x), 2)}`);
      const half = (diff.hi - diff.lo) / 2;
      blocks.push(`<div class="lab-stat lab-stat--diff"><div class="ls-label">B − A</div><div class="ls-big">${fmt(diff.d)}</div>
        <div class="ls-small">± ${isP ? `${fx(half * 100)} pp` : fx(half, 2)}</div>
        <span class="lab-diff-word">${detectable(diff) ? 'A real difference' : 'Too small to tell apart at this many runs'}</span></div>`);
    }
    this.bigEl.innerHTML = blocks.join('');

    // The table: every measure, for each rule set.
    const head = sets.length === 2 ? '<th>Measure</th><th class="num">Rules A</th><th class="num">Rules B</th><th class="num">B − A</th><th>Math</th><th>Target</th>' : '<th>Measure</th><th class="num">Result</th><th>Math</th><th>Target</th>';
    const rows = g.metrics.map((m, r) => {
      const cells = shown[r];
      const val = (c: Shown) => `${c.big} <span class="lab-pm">${esc(c.small)}</span>`;
      const d = sets.length === 2 ? this.diffOf(cells[0].est, cells[1].est) : null;
      const dTxt = d ? (cells[0].est.kind === 'proportion' ? `${d.d >= 0 ? '+' : '−'}${fx(Math.abs(d.d) * 100)} pp` : `${d.d >= 0 ? '+' : '−'}${fx(Math.abs(d.d), 2)}`) : '';
      const exact = cells.map((c) => c.exact || '—').join(' / ');
      const tgt = cells.map((c, i) => (c.assessment ? `${sets.length === 2 ? `${sets[i].name}: ` : ''}${c.assessment.label}` : '')).filter(Boolean).join(', ') || '—';
      return `<tr class="${m.id === this.state.metric ? 'is-selected' : ''}">
        <td><button type="button" class="lab-row" data-metric="${m.id}" aria-pressed="${m.id === this.state.metric}">${esc(m.label)}</button></td>
        ${cells.map((c) => `<td class="num">${val(c)}</td>`).join('')}${sets.length === 2 ? `<td class="num">${dTxt || '—'}</td>` : ''}
        <td class="lab-math">${exact}</td><td>${esc(tgt)}</td></tr>`;
    });
    this.tableEl.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody>`;

    // The chart for the selected measure.
    const isDist = metric.kind === 'distribution';
    this.chart.el.hidden = isDist;
    this.hist.el.hidden = !isDist;
    if (isDist) this.drawHistogram(sets, sel);
    else this.drawDots(metric, sets, sel);

    const anyExact = sel.some((c) => c.exact);
    this.methodEl.textContent = `Simulated: ${formatInt(n)} runs per rule set, seed ${this.state.seed}. ${
      anyExact ? 'Dashed marks are the exact answers from the math.' : g.exact ? 'No exact answer for these rules: simulation only.' : 'This game has no exact answer: simulation only.'
    }`;
    this.renderCalc();
    if (final) this.renderNote(metric, sel, n);
  }

  private runsOf(agg: unknown): number {
    return (agg as { n?: number }).n ?? 0;
  }

  private diffOf(a: MetricEstimate, b: MetricEstimate): Difference | null {
    if (a.kind === 'proportion' && b.kind === 'proportion') return diffProportion(a.value, b.value);
    if (a.kind === 'mean' && b.kind === 'mean' && a.value.n > 1 && b.value.n > 1) return diffMean(a.value, b.value);
    return null;
  }

  private drawDots(metric: MetricSpec<unknown, unknown>, sets: RuleSet[], sel: Shown[]): void {
    const isP = metric.kind === 'proportion';
    const target = metric.kind !== 'distribution' ? metric.target : undefined;
    const points: DotPoint[] = sel.map((c, i) => {
      const r = c.range ?? { p: NaN, lo: NaN, hi: NaN };
      const ex = c.est.kind !== 'distribution' && c.est.exact !== null ? c.est.exact : NaN;
      return { value: r.p, lo: r.lo, hi: r.hi, exact: ex, tone: i === 0 ? 'p1' : 'p2', sub: c.small };
    });
    const vals = points.flatMap((p) => [p.lo, p.hi, p.exact]);
    if (target) vals.push(target.center - target.tolerance, Math.min(target.center + target.tolerance, isP ? 1 : Infinity));
    const ax = niceAxis(vals, isP);
    void this.chart.set(
      {
        xs: sets.map((s) => `Rules ${s.name}`),
        points,
        yMin: ax.min,
        yMax: ax.max,
        yStep: ax.step,
        yFormat: isP ? (v) => `${Math.round(v * 1000) / 10}%` : (v) => String(Math.round(v * 100) / 100),
        valueFormat: isP ? (v) => pct(v) : (v) => fx(v, 2),
        xLabel: metric.label,
        band: target ? { lo: target.center - target.tolerance, hi: target.center + target.tolerance, label: `Target band: ${this.bandText(target, isP)}` } : null,
        legend: [...sets.map((s, i) => ({ mark: (i === 0 ? 'p1' : 'p2') as 'p1' | 'p2', label: `Rules ${s.name}` })), ...(points.some((p) => Number.isFinite(p.exact)) ? [{ mark: 'exact' as const, label: 'Exact' }] : [])],
        aria: `${metric.label} for each rule set, with 95% confidence intervals`,
      },
      0,
    );
  }

  private drawHistogram(sets: RuleSet[], sel: Shown[]): void {
    const a = sel[0].est;
    if (a.kind !== 'distribution') return;
    const b = sets.length === 2 ? sel[1].est : null;
    const ref = b && b.kind === 'distribution' ? b.value : a.exact ?? [];
    let xMax = 10;
    for (const d of [a.value, ref]) {
      let cum = 0;
      for (let i = 0; i < d.length; i++) {
        cum += d[i];
        if (cum >= 0.995) {
          xMax = Math.max(xMax, i);
          break;
        }
      }
    }
    void this.hist.set(
      {
        current: a.value,
        reference: ref,
        currentLabel: 'Rules A',
        referenceLabel: b ? 'Rules B' : a.exact ? 'Exact' : '',
        xMax: Math.min(xMax, 200),
        xLabel: this.game.metrics.find((m) => m.id === this.state.metric)?.kind === 'distribution' ? (this.game.metrics.find((m) => m.id === this.state.metric) as { xLabel: string }).xLabel : '',
      },
      0,
    );
  }

  private bandText(t: Target, isP: boolean): string {
    const lo = t.center - t.tolerance;
    const hi = t.center + t.tolerance;
    return isP ? `${Math.round(lo * 1000) / 10}–${Math.round(Math.min(1, hi) * 1000) / 10}%` : `${fx(lo, 1)}–${fx(hi, 1)}`;
  }

  /** The note under the big numbers: what to do about "Not enough data", or how a 10× run ended. */
  private renderNote(metric: MetricSpec<unknown, unknown>, sel: Shown[], n: number): void {
    const unclear = sel.find((c) => c.assessment?.status === 'unclear');
    this.canRunMore = false;
    this.noteEl.className = 'lab-note';
    if (!unclear || !unclear.range || !unclear.assessment || metric.kind === 'distribution') {
      this.noteEl.textContent = this.ranMore ? `${formatInt(n)} runs: every verdict is settled.` : '';
      if (this.ranMore) this.noteEl.classList.add('sub--note');
      return;
    }
    const t = metric.target!;
    const onWord = t.labels.on.toLowerCase();
    const isP = metric.kind === 'proportion';
    const r = unclear.range;
    const a = unclear.assessment;
    const f = (x: number) => (isP ? `${fx(x * 100)}%` : fx(x, 2));
    const crossLo = r.lo < a.bandLo && r.hi > a.bandLo;
    const crossHi = r.lo < a.bandHi && r.hi > a.bandHi;
    const edge = crossLo && !crossHi ? a.bandLo : crossHi && !crossLo ? a.bandHi : NaN;
    const where = Number.isFinite(edge) ? `crosses the edge of “${onWord}” at ${f(edge)}` : `is wider than the whole “${onWord}” range`;
    this.noteEl.classList.add('sub--prompt');
    if (n * 10 > MAX_RUNS || this.ranMore) {
      this.noteEl.textContent = n * 10 > MAX_RUNS ? stillUnclearLine(onWord) : `${stillUnclearLine(onWord)}`;
      return;
    }
    this.canRunMore = true;
    // Proportions use the talk's exact sentence; means say the same with their own unit.
    this.noteEl.textContent = isP
      ? `${unclearPrompt(r, a, onWord, NOUN.many)} `
      : `Too close to call. The likely range, ${f(r.lo)}–${f(r.hi)}, ${where}. More runs shrink the range. `;
    const b = el('button', { type: 'button', class: 'sub-action' }, `Run ${formatInt(n * 10)} runs (N)`);
    b.addEventListener('click', () => this.refresh('more'));
    this.noteEl.append(b);
  }

  /** "To tell an edge of 2 pp from no edge you need about 2,401 runs." For the selected measure. */
  private renderCalc(): void {
    const res = this.lastResults;
    const input = this.calcEl.querySelector<HTMLInputElement>('input');
    const metric = this.game.metrics.find((m) => m.id === this.state.metric);
    if (!res || !metric || metric.kind === 'distribution') {
      this.calcEl.hidden = true;
      return;
    }
    this.calcEl.hidden = false;
    const isP = metric.kind === 'proportion';
    const unit = isP ? 'pp' : metric.kind === 'mean' ? metric.unit : '';
    const mi = this.game.metrics.indexOf(metric);
    const est = res.shown[mi][0].est;
    const sd = est.kind === 'proportion' ? proportionSd(est.value.p) : est.kind === 'mean' ? meanSd(est.value) : NaN;
    if (!input || input.dataset.unit !== unit) {
      this.calcEl.innerHTML = `How many runs? To tell an edge of <input type="number" class="lab-edge" min="0.1" step="0.5" value="${isP ? 2 : 0.5}" data-unit="${esc(unit)}" aria-label="Edge size in ${esc(unit)}"> ${esc(unit)} from no edge, you need about <strong class="lab-calc-n"></strong>.`;
    }
    const edgeIn = this.calcEl.querySelector<HTMLInputElement>('input')!;
    const edge = Number(edgeIn.value) / (isP ? 100 : 1);
    const one = runsToDetect(edge, sd);
    const comparing = res.sets.length === 2;
    const need = comparing ? one * 2 : one;
    this.calcEl.querySelector('.lab-calc-n')!.textContent = Number.isFinite(need)
      ? `${formatInt(need)} runs${comparing ? ' per rule set (comparing two rule sets doubles it)' : ''}`
      : 'more data first';
  }

  // ---- sweeps -------------------------------------------------------------------------------------

  private async runSweep(mode: 'instant' | 'reveal', epoch: number): Promise<void> {
    const g = this.game;
    const px = g.params.find((p) => p.key === this.state.sweepX)!;
    const py = this.state.sweepY ? g.params.find((p) => p.key === this.state.sweepY) ?? null : null;
    const metric = sweepableMetrics(g).find((m) => m.id === this.metricSel.value) ?? sweepableMetrics(g)[0];
    const xs = sweepValues(px);
    const ys = py ? sweepValues(py, 9) : [null];
    const n = py ? Math.min(this.state.n, SWEEP_2D_MAX) : this.state.n;
    const cfgAt = (x: unknown, y: unknown): Config => ({ ...this.state.a, [px.key]: x, ...(py ? { [py.key]: y } : {}) });
    this.heat.el.hidden = !py;
    this.sweepDots.el.hidden = !!py;
    const relevance = !isRelevant(px, this.state.a) || (py && !isRelevant(py, this.state.a));
    this.sweepMethod.textContent = `Running ${formatInt(xs.length * ys.length)} rule sets…`;

    const cells = ys.map((y) => xs.map((x) => Promise.all([this.agg(cfgAt(x, y), n), this.exact(cfgAt(x, y))])));
    const flat = await Promise.all(cells.flat());
    if (epoch !== this.epoch) return;
    const shown = flat.map(([agg, ex]) => this.show(metric, agg, ex));
    const at = (yi: number, xi: number) => shown[yi * xs.length + xi];
    const isP = metric.kind === 'proportion';
    const target = 'target' in metric ? metric.target : undefined;
    const fmt = isP ? (v: number) => pct(v) : (v: number) => fx(v, 2);

    // CSV rows for this sweep.
    this.lastSweep = [
      ['game', px.key, ...(py ? [py.key] : []), 'measure', 'value', 'ci_low', 'ci_high', 'exact', 'target', 'runs', 'seed'],
      ...ys.flatMap((y, yi) =>
        xs.map((x, xi) => {
          const c = at(yi, xi);
          return [g.id, String(x), ...(py ? [String(y)] : []), metric.id, c.range?.p ?? null, c.range?.lo ?? null, c.range?.hi ?? null, c.exact || null, c.assessment?.label ?? null, n, this.state.seed];
        }),
      ),
    ];

    const note = `Each ${py ? 'cell' : 'point'}: ${formatInt(n)} runs of rules A with ${py ? 'these two settings' : 'this setting'} changed, seed ${this.state.seed}.${
      py && this.state.n > SWEEP_2D_MAX ? ` Two-setting sweeps use at most ${formatInt(SWEEP_2D_MAX)} runs per cell.` : ''
    }${relevance ? ' This setting only matters with some other choices: check the rules on the left.' : ''}`;

    if (!py) {
      const points: DotPoint[] = xs.map((_, xi) => {
        const c = at(0, xi);
        const r = c.range ?? { p: NaN, lo: NaN, hi: NaN };
        const ex = c.est.kind !== 'distribution' && c.est.exact !== null ? c.est.exact : NaN;
        return { value: r.p, lo: r.lo, hi: r.hi, exact: ex, tone: c.assessment?.status === 'on' ? 'best' : 'p1', sub: c.small };
      });
      const vals = points.flatMap((p) => [p.lo, p.hi, p.exact]);
      if (target) vals.push(target.center - target.tolerance, Math.min(target.center + target.tolerance, isP ? 1 : Infinity));
      const ax = niceAxis(vals, isP);
      const base: Omit<DotSweepData, 'points'> = {
        xs: xs.map((v) => valueLabel(px, v)),
        yMin: ax.min,
        yMax: ax.max,
        yStep: ax.step,
        yFormat: isP ? (v) => `${Math.round(v * 1000) / 10}%` : (v) => String(Math.round(v * 100) / 100),
        valueFormat: fmt,
        xLabel: `${px.label}${px.kind === 'int' && px.unit ? ` (${px.unit})` : ''}: ${metric.label}`,
        band: target ? { lo: target.center - target.tolerance, hi: target.center + target.tolerance, label: `Target band: ${this.bandText(target, isP)}` } : null,
        legend: [
          { mark: 'p1', label: 'Simulated' },
          ...(target ? [{ mark: 'best' as const, label: `${target.labels.on}: inside the band` }] : []),
          ...(points.some((p) => Number.isFinite(p.exact)) ? [{ mark: 'exact' as const, label: 'Exact' }] : []),
        ],
        aria: `${metric.label} for each value of ${px.label}, with 95% confidence intervals`,
      };
      // Sweeps reveal one point at a time on an explicit run, like the talk's sweeps.
      if (mode === 'reveal') {
        sound.runStart();
        for (let i = 1; i <= points.length; i++) {
          await this.sweepDots.set({ ...base, points: points.slice(0, i) }, 0);
          sound.tick();
          if (i < points.length && !(await this.ctx.wait(300, epoch))) return;
        }
        sound.verdict();
      } else await this.sweepDots.set({ ...base, points }, 0);
    } else {
      const values = ys.map((_, yi) => xs.map((_, xi) => at(yi, xi).range?.p ?? NaN));
      const onTarget = ys.map((_, yi) => xs.map((_, xi) => at(yi, xi).assessment?.status === 'on'));
      const base: Omit<HeatmapData, 'values'> = {
        xs: xs.map((v) => valueLabel(px, v)),
        ys: ys.map((v) => valueLabel(py, v)),
        onTarget,
        format: fmt,
        xLabel: `${px.label}${px.kind === 'int' && px.unit ? ` (${px.unit})` : ''}: ${metric.label}`,
        yLabel: `${py.label}${py.kind === 'int' && py.unit ? ` (${py.unit})` : ''}`,
        targetNote: target ? `Teal: ${target.labels.on.toLowerCase()} (${this.bandText(target, isP)})` : '',
        aria: `${metric.label} for each pair of ${px.label} and ${py.label}`,
      };
      if (mode === 'reveal') {
        sound.runStart();
        for (let r = 1; r <= ys.length; r++) {
          await this.heat.set({ ...base, values: values.map((row, yi) => (yi < r ? row : row.map(() => NaN))) }, 0);
          sound.tick();
          if (r < ys.length && !(await this.ctx.wait(300, epoch))) return;
        }
        sound.verdict();
      } else await this.heat.set({ ...base, values }, 0);
    }
    this.sweepMethod.textContent = note;
  }

  // ---- export, keys, theme --------------------------------------------------------------------------

  private download(name: string, rows: (string | number | boolean | null)[][]): void {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  private downloadResults(): void {
    const res = this.lastResults;
    if (!res) return;
    const g = this.game;
    const rules = (c: Config) => g.params.map((p) => `${p.key}=${valueLabel(p, c[p.key])}`).join('; ');
    const rows: (string | number | boolean | null)[][] = [['game', 'rules', 'settings', 'measure', 'value', 'ci_low', 'ci_high', 'exact', 'target', 'runs', 'seed']];
    g.metrics.forEach((m, mi) =>
      res.sets.forEach((s, si) => {
        const c = res.shown[mi][si];
        const value = c.range?.p ?? (c.est.kind === 'distribution' ? Number(c.big) : null);
        rows.push([g.id, s.name, rules(s.config), m.id, value, c.range?.lo ?? null, c.range?.hi ?? null, c.exact || null, c.assessment?.label ?? null, this.state.n, this.state.seed]);
      }),
    );
    this.download(`${g.id}-results.csv`, rows);
  }

  private downloadSweep(): void {
    if (this.lastSweep) this.download(`${this.game.id}-sweep.csv`, this.lastSweep);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') this.run();
    else if (k === 'n' && this.canRunMore && this.state.view === 'results') this.refresh('more');
    else if (k === 'm') sound.toggle();
    else if (k === 't') this.toggleTheme();
    else return;
    e.preventDefault();
  }

  private renderSoundBtn(): void {
    const title = sound.muted ? 'Sound is off (M)' : 'Sound is on (M)';
    this.soundBtn.innerHTML = icon(sound.muted ? 'muted' : 'sound');
    this.soundBtn.title = title;
    this.soundBtn.setAttribute('aria-label', title);
    this.soundBtn.setAttribute('aria-pressed', String(!sound.muted));
  }

  /** The same theme switch as the talk (and the same remembered setting). */
  private toggleTheme(): void {
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
}
