import { showBatches, stableStringify } from '../../core/engine';
import { isCancelled } from '../../core/runner';
import { createRng } from '../../core/rng';
import {
  assess,
  FAIR_TARGET,
  formatInt,
  meanCI,
  wilson,
  type Assessment,
  type AssessmentStatus,
  type Proportion,
} from '../../core/stats';
import { sweep, type RunFn } from '../../core/sweep';
import { playRace, race, type RaceAggregate, type RaceConfig, type RaceEvent, type RaceExact } from '../../games/race';
import { dieSvg } from '../charts/dice';
import { ChartHost } from '../charts/host';
import { renderSweep, type SweepChartData } from '../charts/sweepChart';
import { renderTug, type TugData } from '../charts/tugOfWar';
import type { AppContext, Chapter, EnterInfo, StepDef } from '../types';
import { sound } from '../audio';
import { addingLabel, playBuildUp } from '../buildUp';
import { crossedEdge, resolvedLine, stillUnclearLine, unclearPrompt } from '../targetNotes';
import { el, esc, fx } from '../util';

const N = 10_000;
/** "Not enough data": one key runs 10× more games of the same rules. */
const MORE_N = 100_000;
const BASE: RaceConfig = race.defaultConfig;
const HEAD_STARTS = [0, 1, 2, 3, 4, 5, 6];
/** Fair means P1 wins 50% ± 3 (plan D13). */
const TARGET = FAIR_TARGET;
const ON_WORD = TARGET.labels.on.toLowerCase();
const NOUN = { one: 'game', many: 'games' };
const MORE_LABEL = `Run ${formatInt(MORE_N)} games (N)`;

const COIN_BEAT = 'Every single game still has a winner. Fair means fair across many games, not within one.';

type Control = 'headStart' | 'bonus' | 'catchUp';

/** Step index → which view, which control is live, and the config it starts from. */
const STEP_SETUP: { view: 'track' | 'predict' | 'result' | 'sweep'; control?: Control; config?: Partial<RaceConfig> }[] = [
  { view: 'track' },
  { view: 'predict', config: {} },
  { view: 'result', config: {} },
  { view: 'result', control: 'headStart', config: {} },
  { view: 'sweep' },
  { view: 'result', control: 'bonus', config: { p2FirstRollBonus: 1 } },
  { view: 'result', control: 'catchUp', config: { catchUp: true } },
];

const STATUS_CLASS: Record<AssessmentStatus, string> = {
  above: 'favors-p1',
  below: 'favors-p2',
  on: 'fair',
  unclear: 'unclear',
};

/** Every sub-line the "Not enough data" prompt can show, so the presenter reserves its height. */
function promptVariants(): string[] {
  const prop = (p: number, lo: number, hi: number, n = N): Proportion => ({ k: 0, n, p, lo, hi, marginPP: 0 });
  const unclearA = assess(prop(0.481, 0.471, 0.491), TARGET);
  const wideA = assess(prop(0.5, 0.437, 0.563), TARGET);
  const settled = assess(prop(0.534, 0.531, 0.537, MORE_N), TARGET);
  return [
    `${unclearPrompt(prop(0.481, 0.471, 0.491), unclearA, ON_WORD)} ${MORE_LABEL}`,
    `${unclearPrompt(prop(0.5, 0.437, 0.563), wideA, ON_WORD)} ${MORE_LABEL}`,
    resolvedLine(prop(0.534, 0.531, 0.537, MORE_N), settled),
    stillUnclearLine(ON_WORD),
  ];
}
const PROMPTS = promptVariants();

const fairBand = `${Math.round((TARGET.center - TARGET.tolerance) * 100)}–${Math.round((TARGET.center + TARGET.tolerance) * 100)}%`;
const list = (xs: number[]) => (xs.length < 2 ? String(xs[0]) : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The sweep's conclusion, from which head starts land where. */
function sweepSub(statuses: AssessmentStatus[]): string {
  const on = HEAD_STARTS.filter((_, i) => statuses[i] === 'on');
  const unclear = HEAD_STARTS.filter((_, i) => statuses[i] === 'unclear');
  if (on.length) {
    return `Head start${on.length > 1 ? 's' : ''} ${list(on)} land${on.length > 1 ? '' : 's'} inside the fair band, ${fairBand}. Next: two other ways to get there.`;
  }
  if (unclear.length) return `Head start ${list(unclear)} is too close to call at ${formatInt(N)} games: run more to know.`;
  return 'No whole-number head start lands inside the fair band, so change the rule, not the number.';
}

export class RaceChapter implements Chapter {
  id = 'race';
  title = 'The First-Player Problem';
  minutes = 2.75;
  showsStats = true;
  steps: StepDef[] = [
    {
      caption: 'A simple race. Roll and move. First to the end wins.',
      sub: `${BASE.trackLength} squares, one d6, Player 1 always moves first.`,
      subVariants: [COIN_BEAT],
    },
    {
      caption: 'Predict: how often does Player 1 win?',
      sub: 'Moving first is a small edge. 50%? 55%? 65%? Commit to a number before we run it.',
      activity: true,
    },
    { caption: 'Is it fair? Play it 10,000 times.', subVariants: PROMPTS },
    {
      caption: 'Fix #1: give Player 2 a head start.',
      sub: 'Press + / − to change the head start. Push it until the verdict flips.',
      subVariants: PROMPTS,
    },
    {
      caption: 'Too far. Balancing is overcorrection, then correction.',
      subVariants: [sweepSub(['above', 'above', 'on', 'on', 'below', 'below', 'below']), sweepSub(['above', 'above', 'unclear', 'below', 'below', 'below', 'below']), sweepSub([])],
    },
    {
      caption: 'Fix #2: Player 2 gets +1 on their first roll.',
      sub: 'Mathematically identical to a 1-square head start. Different rule, same numbers.',
      subVariants: PROMPTS,
    },
    {
      caption: 'Fix #3: whoever is behind rolls 2 dice, keeps the best.',
      takeaway: 'Every fix changes how the game feels. Pick the one that feels right, then check its numbers.',
      subVariants: PROMPTS,
    },
  ];

  private ctx!: AppContext;
  private step = 0;
  private cfg: RaceConfig = { ...BASE };

  labLink() {
    return { game: 'race', config: STEP_SETUP[this.step].view === 'result' ? this.cfg : BASE };
  }
  private token = 0;
  private demoCount = 0;
  private cache = new Map<string, Promise<RaceAggregate>>();
  private exactCache = new Map<string, Promise<RaceExact | null>>();
  /** The current result reads "Not enough data" at 10,000 games, so N may run more. */
  private canRunMore = false;

  // DOM
  private trackView!: HTMLElement;
  private resultView!: HTMLElement;
  private sweepView!: HTMLElement;
  private controls!: HTMLElement;
  private slider!: HTMLInputElement;
  private sliderOut!: HTMLElement;
  private bonusToggle!: HTMLInputElement;
  private catchToggle!: HTMLInputElement;
  private readout!: HTMLElement;
  private feelCard!: HTMLElement;
  private tug!: ChartHost<TugData>;
  private sweepChart!: ChartHost<SweepChartData>;

  mount(stage: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    stage.classList.add('ch-race');
    this.trackView = el('div', { class: 'view track-view' });
    this.resultView = el('div', { class: 'view result-view' });
    this.sweepView = el('div', { class: 'view chart-host sweep-host' });
    stage.append(this.trackView, this.resultView, this.sweepView);

    this.controls = el('div', { class: 'controls' });
    this.controls.innerHTML = `
      <label class="ctl" data-ctl="headStart">
        <span class="ctl-name">P2 head start</span>
        <input type="range" min="0" max="6" step="1" value="0" aria-label="Player 2 head start in squares">
        <output class="ctl-val">0</output><span class="ctl-unit">squares</span>
      </label>
      <label class="ctl switch" data-ctl="bonus">
        <input type="checkbox" aria-label="Player 2 gets plus one on first roll"><span class="knob"></span>
        <span class="ctl-name">P2 +1 on first roll</span>
      </label>
      <label class="ctl switch" data-ctl="catchUp">
        <input type="checkbox" aria-label="Catch-up rule"><span class="knob"></span>
        <span class="ctl-name">Catch-up: behind rolls 2, keeps best</span>
      </label>
      <div class="rules-chip"></div>`;
    this.slider = this.controls.querySelector('input[type=range]')!;
    this.sliderOut = this.controls.querySelector('output')!;
    this.bonusToggle = this.controls.querySelector('[data-ctl=bonus] input')!;
    this.catchToggle = this.controls.querySelector('[data-ctl=catchUp] input')!;
    this.slider.addEventListener('input', () => {
      this.cfg = { ...this.cfg, p2HeadStart: Number(this.slider.value) };
      this.onControlChange();
    });
    this.slider.addEventListener('change', () => this.slider.blur());
    this.bonusToggle.addEventListener('change', () => {
      this.cfg = { ...this.cfg, p2FirstRollBonus: this.bonusToggle.checked ? 1 : 0 };
      this.bonusToggle.blur();
      this.onControlChange();
    });
    this.catchToggle.addEventListener('change', () => {
      this.cfg = { ...this.cfg, catchUp: this.catchToggle.checked };
      this.catchToggle.blur();
      this.onControlChange();
    });

    this.readout = el('div', { class: 'race-readout' });
    this.feelCard = el('div', { class: 'feel-card' });
    const grid = el('div', { class: 'result-grid' });
    grid.append(this.readout, this.feelCard);
    const tugHost = el('div', { class: 'chart-host tug-host' });
    this.resultView.append(this.controls, grid, tugHost);

    this.tug = new ChartHost(tugHost, renderTug);
    this.sweepChart = new ChartHost(this.sweepView, renderSweep);
  }

  reseed(): void {
    this.cache.clear();
    this.demoCount = 0;
    this.sweepChart.clear();
  }

  // ---- data -----------------------------------------------------------------

  private key(c: RaceConfig): string {
    return stableStringify(c);
  }

  private getAgg(c: RaceConfig): Promise<RaceAggregate> {
    const k = this.key(c);
    let p = this.cache.get(k);
    if (!p) {
      p = this.ctx.runner.run<RaceAggregate>('race', c, N, this.ctx.seed);
      const pp = p;
      p.catch(() => this.cache.get(k) === pp && this.cache.delete(k));
      this.cache.set(k, p);
    }
    return p;
  }

  private getExact(c: RaceConfig): Promise<RaceExact | null> {
    const k = this.key(c);
    let p = this.exactCache.get(k);
    if (!p) {
      p = this.ctx.runner.exact<RaceExact | null>('race', c);
      this.exactCache.set(k, p);
    }
    return p;
  }

  // ---- step routing ---------------------------------------------------------

  enter(step: number, info: EnterInfo): void {
    this.step = step;
    this.canRunMore = false;
    const setup = STEP_SETUP[step];
    this.trackView.hidden = setup.view !== 'track';
    this.resultView.hidden = setup.view !== 'result' && setup.view !== 'predict';
    this.sweepView.hidden = setup.view !== 'sweep';
    const audible = info.direction !== 'backward';
    const go = async () => {
      if (setup.view === 'track') {
        if (info.direction === 'rerun') this.demoCount++;
        await this.playDemo(info.animate, audible);
      } else if (setup.view === 'sweep') {
        await this.runSweep(info.animate, audible);
      } else if (setup.view === 'predict') {
        this.cfg = { ...BASE };
        this.syncControls(undefined);
        this.renderPredict();
      } else {
        // Each fix is evaluated on its own: reset to the step's config on entry
        // (but keep the presenter's head-start choice when re-running step 4).
        if (!(setup.control === 'headStart' && info.direction === 'rerun')) this.cfg = { ...BASE, ...setup.config };
        this.syncControls(setup.control);
        await this.runCurrent(info.animate, audible);
      }
    };
    go().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  adjust(delta: number): void {
    const control = STEP_SETUP[this.step].control;
    if (control === 'headStart') {
      const v = Math.max(0, Math.min(6, this.cfg.p2HeadStart + delta));
      if (v === this.cfg.p2HeadStart) return;
      this.cfg = { ...this.cfg, p2HeadStart: v };
    } else if (control === 'bonus') {
      this.cfg = { ...this.cfg, p2FirstRollBonus: delta > 0 ? 1 : 0 };
    } else if (control === 'catchUp') {
      this.cfg = { ...this.cfg, catchUp: delta > 0 };
    } else return;
    this.syncControls(control);
    this.onControlChange();
  }

  onKey(key: string): boolean {
    if (key !== 'n' || !this.canRunMore) return false;
    this.runMore().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
    return true;
  }

  private onControlChange(): void {
    this.syncControls(STEP_SETUP[this.step].control);
    // Slider/toggle re-runs always use Fast mode.
    this.runCurrent(false, true).catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  private syncControls(active?: Control): void {
    for (const c of this.controls.querySelectorAll<HTMLElement>('.ctl')) {
      c.hidden = c.dataset.ctl !== active;
    }
    this.slider.value = String(this.cfg.p2HeadStart);
    this.sliderOut.textContent = String(this.cfg.p2HeadStart);
    this.bonusToggle.checked = this.cfg.p2FirstRollBonus > 0;
    this.catchToggle.checked = this.cfg.catchUp;
    const c = this.cfg;
    const parts = [
      `Head start ${c.p2HeadStart}`,
      `First-roll bonus ${c.p2FirstRollBonus ? '+1' : 'off'}`,
      `Catch-up ${c.catchUp ? 'on' : 'off'}`,
    ];
    this.controls.querySelector('.rules-chip')!.textContent = `Rules: ${parts.join(' · ')}`;
  }

  // ---- step 1: one animated game ------------------------------------------

  private async playDemo(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const events: RaceEvent[] = [];
    const outcome = playRace(BASE, createRng(`${this.ctx.seed}|race-demo|${this.demoCount}`), (e) => events.push(e));
    const L = BASE.trackLength;
    const cells = (p: 1 | 2) =>
      Array.from({ length: L + 1 }, (_, i) => {
        const cls = i === 0 ? 'cell start' : i === L ? 'cell finish' : 'cell';
        const label = i === 0 ? 'Start' : i === L ? 'Finish' : String(i);
        return `<div class="${cls}">${label}</div>`;
      }).join('') + `<div class="token p${p}" data-p="${p}">P${p}</div>`;
    this.trackView.innerHTML = `
      <div class="track" style="--cells:${L + 1}">
        <div class="race-lane" data-lane="1"><div class="lane-label who who--p1">P1</div><div class="squares">${cells(1)}</div></div>
        <div class="race-lane" data-lane="2"><div class="lane-label who who--p2">P2</div><div class="squares">${cells(2)}</div></div>
      </div>
      <div class="turn-info"><div class="turn-dice"></div><div class="turn-text">Player 1 moves first.</div></div>
      <div class="hint">Press R to play another game.</div>`;
    const tokens = [1, 2].map((p) => this.trackView.querySelector<HTMLElement>(`.token.p${p}`)!);
    const lanes = [1, 2].map((p) => this.trackView.querySelector<HTMLElement>(`.race-lane[data-lane="${p}"]`)!);
    const diceEl = this.trackView.querySelector<HTMLElement>('.turn-dice')!;
    const textEl = this.trackView.querySelector<HTMLElement>('.turn-text')!;
    const place = (p: number, pos: number) => {
      tokens[p - 1].style.left = `calc((${Math.min(pos, L)} + 0.5) / ${L + 1} * 100%)`;
    };
    place(1, 0);
    place(2, BASE.p2HeadStart);
    const turnMs = animate ? 800 : 320;
    if (!(await this.ctx.wait(animate ? 600 : 150, epoch))) return;
    for (const ev of events) {
      lanes.forEach((l, i) => l.classList.toggle('active', i + 1 === ev.player));
      const tone = ev.player === 1 ? 'p1' : 'p2';
      diceEl.innerHTML = ev.rolls.map((r) => dieSvg(r, 64, tone)).join('');
      const pos = ev.positions[ev.player - 1];
      textEl.innerHTML = `<b class="who who--p${ev.player}">P${ev.player}</b> rolls ${ev.rolls.join(' & ')}, moves to ${
        pos >= L ? 'the finish!' : `square ${pos}`
      }`;
      place(ev.player, pos);
      if (audible) sound.dice();
      if (!(await this.ctx.wait(turnMs, epoch))) return;
    }
    lanes.forEach((l) => l.classList.remove('active'));
    lanes[outcome.winner - 1].classList.add('winner');
    textEl.innerHTML = `<b class="who who--p${outcome.winner}">Player ${outcome.winner} wins</b> after ${outcome.turns} turns.`;
    // The coin-flip beat: one game always has a winner, so fairness can only be seen across games.
    this.ctx.setSub(COIN_BEAT, { tone: 'note' });
    if (audible) sound.verdict();
  }

  // ---- predict: the result screen before anything has run --------------------

  private renderPredict(): void {
    this.feelCard.hidden = true;
    this.readout.innerHTML = `
      <div class="rr-row"><span class="rr-name"><span class="swatch swatch--p1"></span>P1 wins</span><span class="rr-big">?</span><span class="rr-ci"></span></div>
      <div class="rr-row"><span class="rr-name"><span class="swatch swatch--p2"></span>P2 wins</span><span class="rr-big">?</span><span class="rr-ci"></span></div>
      <div class="rr-meta">Nothing run yet: your guess first.</div>
      <div class="verdict" style="visibility:hidden">&nbsp;</div>`;
    void this.tug.set(this.tugData(undefined, null, NaN), 0);
  }

  private tugData(p1: Proportion | undefined, exact: RaceExact | null, ghost: number, a?: Assessment): TugData {
    const bandLo = TARGET.center - TARGET.tolerance;
    const bandHi = TARGET.center + TARGET.tolerance;
    return {
      p: p1?.p ?? NaN,
      lo: p1?.lo ?? NaN,
      hi: p1?.hi ?? NaN,
      exact: exact ? exact.p1Win : NaN,
      ghost,
      bandLo,
      bandHi,
      bandName: TARGET.labels.on,
      crossed: p1 && a?.status === 'unclear' ? crossedEdge(p1, a) : NaN,
    };
  }

  // ---- result steps -----------------------------------------------------------

  /** `audible`: the presenter asked for this (forward step, re-run or tweak), not a step back. */
  private async runCurrent(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const token = ++this.token;
    const live = () => this.ctx.alive(epoch) && token === this.token;
    const cfg = this.cfg;
    const showFeel = STEP_SETUP[this.step].control === 'catchUp';
    const showGhost = this.step > 2;
    this.feelCard.hidden = !showFeel;
    this.canRunMore = false;

    const [exact, baseline] = await Promise.all([
      this.getExact(cfg),
      showGhost || showFeel ? this.getAgg(BASE) : Promise.resolve(undefined),
    ]);
    if (!live()) return;

    if (animate) {
      // Show mode: stream cumulative batches 1, 10, 100, 1,000, 10,000 into the same aggregate.
      const snaps: RaceAggregate[] = [];
      const p = this.ctx.runner.run<RaceAggregate>(
        'race', cfg, N, this.ctx.seed,
        (pr) => pr.checkpoint && snaps.push(pr.aggregate),
        { checkpoints: showBatches(N) },
      );
      const k = this.key(cfg);
      this.cache.set(k, p);
      p.catch(() => this.cache.get(k) === p && this.cache.delete(k));
      const final = await p;
      if (!live()) return;
      const frames = [...snaps, final].map((agg) => ({ n: agg.n, data: agg }));
      const done = await playBuildUp(
        this.ctx,
        epoch,
        frames,
        (agg, ms) => this.renderResult(agg, exact, baseline, showFeel, ms, agg === final),
        { noun: NOUN, tweenMs: 500, holdMs: 900, alive: live },
      );
      if (done) sound.verdict();
    } else {
      // A tweak (slider, toggle) or Fast mode: update straight away.
      const agg = await this.getAgg(cfg);
      if (!live()) return;
      this.renderResult(agg, exact, baseline, showFeel, 300, true);
      if (audible) sound.verdict();
    }
  }

  /** N: run 10× more games of the same rules, adding to the 10,000 already shown. */
  private async runMore(): Promise<void> {
    if (!this.canRunMore) return;
    this.canRunMore = false;
    const epoch = this.ctx.epoch;
    const token = ++this.token;
    const live = () => this.ctx.alive(epoch) && token === this.token;
    const cfg = this.cfg;
    const showFeel = STEP_SETUP[this.step].control === 'catchUp';
    // Keep the prompt's words while the games are added, without the button.
    const p1now = await this.getAgg(cfg).then((a) => wilson(a.p1Wins, a.n));
    this.ctx.setSub(unclearPrompt(p1now, assess(p1now, TARGET), ON_WORD), { tone: 'prompt' });
    const [exact, baseline, first] = await Promise.all([
      this.getExact(cfg),
      this.step > 2 || showFeel ? this.getAgg(BASE) : Promise.resolve(undefined),
      this.getAgg(cfg),
    ]);
    // The run's stream depends only on (seed, game, rules), so its first 10,000 games are the ones on screen.
    const snaps: RaceAggregate[] = [];
    const more = await this.ctx.runner.run<RaceAggregate>(
      'race', cfg, MORE_N, this.ctx.seed,
      (pr) => pr.checkpoint && snaps.push(pr.aggregate),
      { checkpoints: [20_000, 50_000] },
    );
    if (!live()) return;
    const show = (agg: RaceAggregate, ms: number) => this.renderResult(agg, exact, baseline, showFeel, ms, agg === more);
    if (this.ctx.mode === 'show') {
      const frames = [first, ...snaps, more].map((agg) => ({ n: agg.n, data: agg }));
      const done = await playBuildUp(this.ctx, epoch, frames, show, {
        noun: NOUN,
        tweenMs: 600,
        holdMs: 900,
        alive: live,
        label: (n) => addingLabel(n, MORE_N, NOUN),
      });
      if (done) sound.verdict();
    } else {
      show(more, 300);
      sound.verdict();
    }
  }

  private renderResult(
    agg: RaceAggregate,
    exact: RaceExact | null,
    baseline: RaceAggregate | undefined,
    showFeel: boolean,
    ms: number,
    final: boolean,
  ): void {
    const p1 = wilson(agg.p1Wins, agg.n);
    const p2 = wilson(agg.p2Wins, agg.n);
    const a = assess(p1, TARGET);
    // Derive P2 from the rounded P1 so the two readouts always add up to 100.0%.
    const p2Shown = Number.isFinite(p1.p) ? fx(100 - Number(fx(p1.p * 100))) : fx(NaN);
    const exactTxt = exact
      ? `<span class="exact-inline">math: ${fx(exact.p1Win * 100, 2)}%</span>`
      : `<span class="exact-inline">no closed form — simulation only</span>`;
    this.readout.innerHTML = `
      <div class="rr-row"><span class="rr-name"><span class="swatch swatch--p1"></span>P1 wins</span><span class="rr-big">${fx(p1.p * 100)}%</span><span class="rr-ci">± ${fx(p1.marginPP)} pp</span></div>
      <div class="rr-row"><span class="rr-name"><span class="swatch swatch--p2"></span>P2 wins</span><span class="rr-big">${p2Shown}%</span><span class="rr-ci">± ${fx(p2.marginPP)} pp</span></div>
      <div class="rr-meta">n = ${formatInt(agg.n)} games · ${exactTxt}${agg.capHits ? ` · ${agg.capHits} games hit the turn cap` : ''}</div>
      <div class="verdict ${STATUS_CLASS[a.status]}">${esc(a.label)}</div>`;
    const ghost = baseline && this.step > 2 ? wilson(baseline.p1Wins, baseline.n).p : NaN;
    void this.tug.set(this.tugData(p1, exact, ghost, a), ms);
    if (showFeel && baseline) this.renderFeel(agg, baseline);
    if (final) this.promptFor(p1, a);
  }

  /** The sub-line under a final result: the "Not enough data" prompt, or how the extra run ended. */
  private promptFor(p1: Proportion, a: Assessment): void {
    if (p1.n === MORE_N) {
      this.canRunMore = false;
      if (a.status === 'unclear') this.ctx.setSub(stillUnclearLine(ON_WORD), { tone: 'prompt' });
      else this.ctx.setSub(resolvedLine(p1, a), { tone: 'note' });
    } else if (a.status === 'unclear') {
      this.canRunMore = true;
      this.ctx.setSub(unclearPrompt(p1, a, ON_WORD), {
        tone: 'prompt',
        action: { label: MORE_LABEL, run: () => void this.onKey('n') },
      });
    } else {
      this.canRunMore = false;
      this.ctx.setSub(null);
    }
  }

  /** How the game feels, current rules against the baseline (simulation only). */
  private renderFeel(agg: RaceAggregate, base: RaceAggregate): void {
    const len = (x: RaceAggregate) => `${fx(meanCI(x.turnsSum, x.turnsSumSq, x.n).mean)} turns`;
    const per = (x: RaceAggregate) => fx(x.leadChangesSum / x.n, 2);
    const pct = (k: number, n: number) => `${fx((k / n) * 100)}%`;
    const rows: [string, string, string][] = [
      ['Average game length', len(base), len(agg)],
      ['Lead changes per game', per(base), per(agg)],
      ['Comebacks: winner was behind at halfway', pct(base.comebacks, base.n), pct(agg.comebacks, agg.n)],
      ['Decided early: winner led from halfway on', pct(base.decidedEarly, base.n), pct(agg.decidedEarly, agg.n)],
    ];
    const current = this.cfg.catchUp ? 'With catch-up' : 'Current rules';
    this.feelCard.innerHTML = `
      <table class="feel-table">
        <thead><tr><th>How it plays</th><th class="num">Baseline</th><th class="num">${current}</th></tr></thead>
        <tbody>${rows.map(([l, b, c]) => `<tr><td>${l}</td><td class="num">${b}</td><td class="num">${c}</td></tr>`).join('')}</tbody>
      </table>
      <p class="feel-note">${formatInt(agg.n)} games each. Simulation only: there is no formula for how a game feels.</p>`;
  }

  // ---- step 5: head-start sweep ---------------------------------------------

  private async runSweep(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const exacts = await Promise.all(HEAD_STARTS.map((h) => this.getExact({ ...BASE, p2HeadStart: h })));
    if (!this.ctx.alive(epoch)) return;
    const ex = exacts.map((e) => e?.p1Win ?? NaN);
    const yMin = Math.max(0, Math.floor((Math.min(...ex) - 0.06) * 10) / 10);
    const yMax = Math.min(1, Math.ceil((Math.max(...ex) + 0.06) * 10) / 10);
    const base: Omit<SweepChartData, 'points'> = {
      xs: HEAD_STARTS,
      yMin,
      yMax,
      xLabel: 'P2 head start (squares)',
      nPerCell: N,
      target: TARGET,
    };

    // Sweep cells go through the same cache as single runs, so head start 0 == the baseline.
    const runFn: RunFn = <A>(_g: string, c: unknown) => this.getAgg(c as RaceConfig) as Promise<A>;
    const res = await sweep<RaceAggregate>('race', BASE, [{ key: 'p2HeadStart', values: HEAD_STARTS }], N, this.ctx.seed, { runFn });
    if (!this.ctx.alive(epoch)) return;
    const points = res.cells.map((c, i) => ({ x: Number(c.coords[0]), k: c.aggregate.p1Wins, n: c.aggregate.n, exact: ex[i] }));
    const sub = sweepSub(points.map((p) => assess(wilson(p.k, p.n), TARGET).status));

    if (animate) {
      this.ctx.setSub(null);
      sound.runStart();
      for (let i = 1; i <= points.length; i++) {
        await this.sweepChart.set({ ...base, points: points.slice(0, i) }, 0);
        sound.tick();
        if (!(await this.ctx.wait(450, epoch))) return;
      }
    } else {
      await this.sweepChart.set({ ...base, points }, 0);
    }
    this.ctx.setSub(sub);
    if (audible) sound.verdict();
  }
}
