import { showBatches, stableStringify } from '../../core/engine';
import { isCancelled } from '../../core/runner';
import { createRng } from '../../core/rng';
import { formatInt, histNormalize, meanCI, verdict, wilson, type Verdict } from '../../core/stats';
import { sweep, type RunFn } from '../../core/sweep';
import { playRace, race, type RaceAggregate, type RaceConfig, type RaceEvent, type RaceExact } from '../../games/race';
import { dieSvg } from '../charts/dice';
import { renderHistogram, type HistogramData } from '../charts/histogram';
import { ChartHost } from '../charts/host';
import { renderSweep, type SweepChartData } from '../charts/sweepChart';
import { renderTug, type TugData } from '../charts/tugOfWar';
import type { AppContext, Chapter, EnterInfo } from '../types';
import { el, fx, sleep } from '../util';

const N = 10_000;
const BASE: RaceConfig = race.defaultConfig;
const HEAD_STARTS = [0, 1, 2, 3, 4, 5, 6];

type Control = 'headStart' | 'bonus' | 'catchUp';

/** Step index → which view, which control is live, and the config it starts from. */
const STEP_SETUP: { view: 'track' | 'result' | 'sweep'; control?: Control; config?: Partial<RaceConfig> }[] = [
  { view: 'track' },
  { view: 'result', config: {} },
  { view: 'result', control: 'headStart', config: {} },
  { view: 'sweep' },
  { view: 'result', control: 'bonus', config: { p2FirstRollBonus: 1 } },
  { view: 'result', control: 'catchUp', config: { catchUp: true } },
];

const verdictClass = (v: Verdict) => (v === 'Favors P1' ? 'favors-p1' : v === 'Favors P2' ? 'favors-p2' : 'fair');

export class RaceChapter implements Chapter {
  id = 'first-player';
  title = 'The First-Player Problem';
  showsStats = true;
  steps = [
    { caption: 'A simple race. Roll and move. First to the end wins.', sub: `${BASE.trackLength} squares, one d6, Player 1 always moves first.` },
    { caption: 'Is it fair? Play it 10,000 times.' },
    { caption: 'Fix #1: give Player 2 a head start.', sub: 'Press + / − to change the head start. Push it until the verdict flips.' },
    { caption: 'Too far. Balancing is overcorrection, then correction.' },
    { caption: 'Fix #2: Player 2 gets +1 on their first roll.', sub: 'Mathematically identical to a 1-square head start. Different rule, same numbers.' },
    { caption: 'Fix #3: whoever is behind rolls 2 dice, keeps the best.', sub: 'Fairer — but it changes how the game feels.' },
  ];

  private ctx!: AppContext;
  private step = 0;
  private cfg: RaceConfig = { ...BASE };
  private token = 0;
  private demoCount = 0;
  private cache = new Map<string, Promise<RaceAggregate>>();
  private exactCache = new Map<string, Promise<RaceExact | null>>();

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
  private lengthCard!: HTMLElement;
  private lengthReadout!: HTMLElement;
  private tug!: ChartHost<TugData>;
  private hist!: ChartHost<HistogramData>;
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
    this.lengthCard = el('div', { class: 'length-card' });
    this.lengthReadout = el('div', { class: 'length-readout' });
    const histHost = el('div', { class: 'chart-host hist-host' });
    this.lengthCard.append(this.lengthReadout, histHost);
    const grid = el('div', { class: 'result-grid' });
    grid.append(this.readout, this.lengthCard);
    const tugHost = el('div', { class: 'chart-host tug-host' });
    this.resultView.append(this.controls, grid, tugHost);

    this.tug = new ChartHost(tugHost, renderTug);
    this.hist = new ChartHost(histHost, renderHistogram);
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
    const setup = STEP_SETUP[step];
    this.trackView.hidden = setup.view !== 'track';
    this.resultView.hidden = setup.view !== 'result';
    this.sweepView.hidden = setup.view !== 'sweep';
    const go = async () => {
      if (setup.view === 'track') {
        if (info.direction === 'rerun') this.demoCount++;
        await this.playDemo(info.animate);
      } else if (setup.view === 'sweep') {
        await this.runSweep(info.animate);
      } else {
        // Each fix is evaluated on its own: reset to the step's config on entry
        // (but keep the presenter's head-start choice when re-running step 3).
        if (!(step === 2 && info.direction === 'rerun')) this.cfg = { ...BASE, ...setup.config };
        this.syncControls(setup.control);
        await this.runCurrent(info.animate);
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

  private onControlChange(): void {
    this.syncControls(STEP_SETUP[this.step].control);
    // Slider/toggle re-runs always use Fast mode.
    this.runCurrent(false).catch((e) => {
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

  private async playDemo(animate: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const events: RaceEvent[] = [];
    const outcome = playRace(BASE, createRng(`${this.ctx.seed}|race-demo|${this.demoCount}`), (e) => events.push(e));
    const L = BASE.trackLength;
    const cells = (p: 1 | 2) =>
      Array.from({ length: L + 1 }, (_, i) => {
        const cls = i === 0 ? 'cell start' : i === L ? 'cell finish' : 'cell';
        const label = i === 0 ? 'Start' : i === L ? '🏁' : String(i);
        return `<div class="${cls}">${label}</div>`;
      }).join('') + `<div class="token p${p}" data-p="${p}">P${p}</div>`;
    this.trackView.innerHTML = `
      <div class="track" style="--cells:${L + 1}">
        <div class="lane" data-lane="1"><div class="lane-label p1">P1</div><div class="squares">${cells(1)}</div></div>
        <div class="lane" data-lane="2"><div class="lane-label p2">P2</div><div class="squares">${cells(2)}</div></div>
      </div>
      <div class="turn-info"><div class="turn-dice"></div><div class="turn-text">Player 1 moves first.</div></div>
      <div class="hint">Press R to play another game.</div>`;
    const tokens = [1, 2].map((p) => this.trackView.querySelector<HTMLElement>(`.token.p${p}`)!);
    const lanes = [1, 2].map((p) => this.trackView.querySelector<HTMLElement>(`.lane[data-lane="${p}"]`)!);
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
      const color = ev.player === 1 ? 'var(--p1)' : 'var(--p2)';
      diceEl.innerHTML = ev.rolls.map((r) => dieSvg(r, 64, color)).join('');
      const pos = ev.positions[ev.player - 1];
      textEl.innerHTML = `<b class="p${ev.player}">P${ev.player}</b> rolls ${ev.rolls.join(' & ')} → ${
        pos >= L ? 'the finish!' : `square ${pos}`
      }`;
      place(ev.player, pos);
      if (!(await this.ctx.wait(turnMs, epoch))) return;
    }
    lanes.forEach((l) => l.classList.remove('active'));
    lanes[outcome.winner - 1].classList.add('winner');
    textEl.innerHTML = `<b class="p${outcome.winner}">Player ${outcome.winner} wins</b> after ${outcome.turns} turns.`;
  }

  // ---- result steps -----------------------------------------------------------

  private async runCurrent(animate: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const token = ++this.token;
    const live = () => this.ctx.alive(epoch) && token === this.token;
    const cfg = this.cfg;
    const showLength = STEP_SETUP[this.step].control === 'catchUp';
    const showGhost = this.step !== 1;
    this.lengthCard.hidden = !showLength;

    const [exact, baseline] = await Promise.all([
      this.getExact(cfg),
      showGhost || showLength ? this.getAgg(BASE) : Promise.resolve(undefined),
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
      for (const agg of [...snaps, final]) {
        this.renderResult(agg, exact, baseline, showLength, 500);
        await sleep(agg === final ? 0 : 900);
        if (!live()) return;
      }
    } else {
      const agg = await this.getAgg(cfg);
      if (!live()) return;
      this.renderResult(agg, exact, baseline, showLength, 300);
    }
  }

  private renderResult(
    agg: RaceAggregate,
    exact: RaceExact | null,
    baseline: RaceAggregate | undefined,
    showLength: boolean,
    ms: number,
  ): void {
    const p1 = wilson(agg.p1Wins, agg.n);
    const p2 = wilson(agg.p2Wins, agg.n);
    const v = verdict(p1);
    // Derive P2 from the rounded P1 so the two readouts always add up to 100.0%.
    const p2Shown = Number.isFinite(p1.p) ? fx(100 - Number(fx(p1.p * 100))) : fx(NaN);
    const exactTxt = exact
      ? `<span class="exact-inline">math: ${fx(exact.p1Win * 100, 2)}%</span>`
      : `<span class="exact-inline">no closed form — simulation only</span>`;
    this.readout.innerHTML = `
      <div class="rr-row"><span class="rr-name p1">P1 wins</span><span class="rr-big p1">${fx(p1.p * 100)}%</span><span class="rr-ci">± ${fx(p1.marginPP)} pp</span></div>
      <div class="rr-row"><span class="rr-name p2">P2 wins</span><span class="rr-big p2">${p2Shown}%</span><span class="rr-ci">± ${fx(p2.marginPP)} pp</span></div>
      <div class="rr-meta">n = ${formatInt(agg.n)} games · ${exactTxt}${agg.capHits ? ` · ⚠ ${agg.capHits} capped` : ''}</div>
      <div class="verdict ${verdictClass(v)}">${v}</div>`;
    const ghost = baseline && this.step !== 1 ? wilson(baseline.p1Wins, baseline.n).p : NaN;
    void this.tug.set({ p: p1.p, lo: p1.lo, hi: p1.hi, exact: exact ? exact.p1Win : NaN, ghost }, ms);

    if (showLength && baseline) {
      const cur = meanCI(agg.turnsSum, agg.turnsSumSq, agg.n);
      const ref = meanCI(baseline.turnsSum, baseline.turnsSumSq, baseline.n);
      this.lengthReadout.innerHTML = `
        <div class="lr-row"><span class="lr-name">Avg game length</span><span class="lr-big">${fx(cur.mean)}</span><span class="lr-ci">± ${fx(cur.margin, 2)} turns</span></div>
        <div class="lr-row muted"><span class="lr-name">Baseline</span><span class="lr-big">${fx(ref.mean)}</span><span class="lr-ci">± ${fx(ref.margin, 2)} turns</span></div>`;
      const curH = histNormalize(agg.turnsHist);
      const refH = histNormalize(baseline.turnsHist);
      let xMax = 10;
      [curH, refH].forEach((h) => h.forEach((f, i) => f > 0.003 && (xMax = Math.max(xMax, i))));
      xMax = Math.ceil(xMax / 5) * 5;
      const pad = (h: number[]) => Array.from({ length: xMax + 1 }, (_, i) => h[i] ?? 0);
      void this.hist.set(
        {
          current: pad(curH),
          reference: pad(refH),
          currentLabel: this.cfg.catchUp ? 'With catch-up' : 'Current rules',
          referenceLabel: 'Baseline',
          xMax,
          xLabel: 'Game length (turns, both players)',
        },
        ms,
      );
    }
  }

  // ---- step 4: head-start sweep ---------------------------------------------

  private async runSweep(animate: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const exacts = await Promise.all(HEAD_STARTS.map((h) => this.getExact({ ...BASE, p2HeadStart: h })));
    if (!this.ctx.alive(epoch)) return;
    const ex = exacts.map((e) => e?.p1Win ?? NaN);
    const yMin = Math.max(0, Math.floor((Math.min(...ex) - 0.06) * 10) / 10);
    const yMax = Math.min(1, Math.ceil((Math.max(...ex) + 0.06) * 10) / 10);
    const base: Omit<SweepChartData, 'points'> = { xs: HEAD_STARTS, yMin, yMax, xLabel: 'P2 head start (squares)', nPerCell: N };

    // Sweep cells go through the same cache as single runs, so head start 0 == the baseline.
    const runFn: RunFn = <A>(_g: string, c: unknown) => this.getAgg(c as RaceConfig) as Promise<A>;
    const res = await sweep<RaceAggregate>('race', BASE, [{ key: 'p2HeadStart', values: HEAD_STARTS }], N, this.ctx.seed, { runFn });
    if (!this.ctx.alive(epoch)) return;
    const points = res.cells.map((c, i) => ({ x: c.coords[0], k: c.aggregate.p1Wins, n: c.aggregate.n, exact: ex[i] }));

    const verdicts = points.map((p) => verdict(wilson(p.k, p.n)));
    const fairIdx = verdicts.findIndex((v) => v === 'Fair within margin');
    const sub =
      fairIdx >= 0
        ? `Head start ${HEAD_STARTS[fairIdx]} is fair within margin.`
        : 'Sometimes no whole number is fair — so change the rule, not the number.';

    if (animate) {
      this.ctx.setSub(null);
      for (let i = 1; i <= points.length; i++) {
        await this.sweepChart.set({ ...base, points: points.slice(0, i) }, 0);
        if (!(await this.ctx.wait(450, epoch))) return;
      }
    } else {
      await this.sweepChart.set({ ...base, points }, 0);
    }
    this.ctx.setSub(sub);
  }
}
