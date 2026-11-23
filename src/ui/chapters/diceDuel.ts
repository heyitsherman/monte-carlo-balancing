import { logCheckpoints, showBatches } from '../../core/engine';
import { isCancelled } from '../../core/runner';
import { createRng } from '../../core/rng';
import { formatInt, wilson } from '../../core/stats';
import {
  DUEL_OUTCOMES,
  diceDuel,
  rollBattle,
  type Battle,
  type DuelAggregate,
  type DuelExact,
  type DuelOutcome,
} from '../../games/diceDuel';
import { renderBarChart, type BarChartData } from '../charts/barChart';
import { renderConvergence, type ConvergenceData } from '../charts/convergenceChart';
import { dieSvg } from '../charts/dice';
import { ChartHost } from '../charts/host';
import type { AppContext, Chapter, EnterInfo, StepDef } from '../types';
import { sound } from '../audio';
import { playBuildUp } from '../buildUp';
import { el, fx, sleep } from '../util';

const ARROW = '<span class="arrow" aria-hidden="true"></span>';
const ARROW_BACK = '<span class="arrow arrow--back" aria-hidden="true"></span>';

const CONFIG = diceDuel.defaultConfig;
const TRACE_N = 100_000;
const NOUN = { one: 'battle', many: 'battles' };
/** Steps: 0 one battle, 1 predict, 2–5 the bars at 10…10,000, 6 the exact math, 7 convergence. */
const PREDICT_STEP = 1;
const EXACT_STEP = 6;
const CONV_STEP = 7;
/** n shown on the bar steps (index = step). */
const STEP_N = [0, 0, 10, 100, 1000, 10_000, 10_000];

const LABELS: Record<DuelOutcome, string> = {
  attackerWinsBoth: 'Attacker wins both',
  split: 'Split 1–1',
  defenderWinsBoth: 'Defender wins both',
};
const COLORS: Record<DuelOutcome, string> = {
  attackerWinsBoth: 'var(--p1)',
  split: 'var(--neutral)',
  defenderWinsBoth: 'var(--p2)',
};
/** Longest sub-line the run steps can show, so the presenter can reserve its height. */
const MARGIN_SUB_LONGEST = 'Whiskers = 95% confidence interval: up to ± 88.8 pp at n = 10,000.';

export class DiceDuelChapter implements Chapter {
  id = 'duel';
  title = 'Dice Duel';
  minutes = 1.75;
  showsStats = true;
  steps: StepDef[] = [
    { caption: 'Attacker rolls 3 dice, defender rolls 2. Who wins?', sub: 'Sort both. Highest vs highest, second vs second. Ties go to the defender.' },
    {
      caption: 'Predict: which outcome is most likely?',
      sub: 'Attacker wins both, a split, or defender wins both? Take a show of hands before we run it.',
      activity: true,
    },
    { caption: '10 battles.', subVariants: [MARGIN_SUB_LONGEST] },
    { caption: '100.', subVariants: [MARGIN_SUB_LONGEST] },
    { caption: '1,000.', subVariants: [MARGIN_SUB_LONGEST] },
    { caption: '10,000.', subVariants: [MARGIN_SUB_LONGEST] },
    {
      caption: 'Now the exact math.',
      sub: 'Dashed lines: exact odds from all 6⁵ = 7,776 possible rolls. Zoom in: do they fall inside the whiskers?',
    },
    {
      caption: 'Noise becomes signal.',
      takeaway: 'Simulation agrees with the math. When the math is too ugly to do, you run the simulation instead.',
    },
  ];

  private ctx!: AppContext;
  private battleView!: HTMLElement;
  private barsView!: HTMLElement;
  private convView!: HTMLElement;
  private bars!: ChartHost<BarChartData>;
  private conv!: ChartHost<ConvergenceData>;
  private battleCount = 0;
  private step = 0;

  labLink() {
    return { game: 'diceDuel', config: diceDuel.defaultConfig };
  }
  private trace?: Promise<Map<number, DuelAggregate>>;
  private exact?: Promise<DuelExact>;

  mount(stage: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    stage.classList.add('ch-dice');
    this.battleView = el('div', { class: 'view battle-view' });
    this.barsView = el('div', { class: 'view chart-host bars-host' });
    this.convView = el('div', { class: 'view chart-host conv-host' });
    stage.append(this.battleView, this.barsView, this.convView);
    this.bars = new ChartHost(this.barsView, renderBarChart);
    this.conv = new ChartHost(this.convView, renderConvergence);
  }

  reseed(): void {
    this.trace = undefined;
    this.battleCount = 0;
    this.bars.clear();
    this.conv.clear();
  }

  private getExact(): Promise<DuelExact> {
    this.exact ??= this.ctx.runner.exact<DuelExact>('diceDuel', CONFIG);
    return this.exact;
  }

  /** One worker run of 100,000 battles; snapshots at log-spaced checkpoints feed every step. */
  private getTrace(): Promise<Map<number, DuelAggregate>> {
    if (!this.trace) {
      const snaps = new Map<number, DuelAggregate>();
      const p = this.ctx.runner
        .run<DuelAggregate>(
          'diceDuel',
          CONFIG,
          TRACE_N,
          this.ctx.seed,
          (pr) => {
            if (pr.checkpoint) snaps.set(pr.done, pr.aggregate);
          },
          { checkpoints: logCheckpoints(TRACE_N) },
        )
        .then((final) => {
          snaps.set(TRACE_N, final);
          return snaps;
        });
      p.catch(() => {
        if (this.trace === p) this.trace = undefined;
      });
      this.trace = p;
    }
    return this.trace;
  }

  private show(view: HTMLElement): void {
    for (const v of [this.battleView, this.barsView, this.convView]) v.hidden = v !== view;
  }

  enter(step: number, info: EnterInfo): void {
    const prev = this.step;
    this.step = step;
    const run = async () => {
      if (step === 0) {
        this.show(this.battleView);
        if (info.direction === 'rerun') this.battleCount++;
        await this.renderBattle(info.animate, info.animate || info.direction === 'rerun');
      } else if (step < CONV_STEP) {
        this.show(this.barsView);
        await this.renderBars(step, prev, info);
      } else {
        this.show(this.convView);
        await this.renderConv(info.animate);
      }
    };
    run().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  // ---- step 0: one battle -------------------------------------------------

  /** `audible`: the presenter asked for this roll (entered the step in Show mode, or pressed R). */
  private async renderBattle(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const b = rollBattle(CONFIG, createRng(`${this.ctx.seed}|battle|${this.battleCount}`));
    if (audible) sound.dice();
    if (animate) {
      const fake = (): Battle => ({
        attacker: [0, 0, 0].map(() => 1 + Math.floor(Math.random() * 6)),
        defender: [0, 0].map(() => 1 + Math.floor(Math.random() * 6)),
        comparisons: [],
        outcome: b.outcome,
      });
      for (let i = 0; i < 8; i++) {
        this.battleView.innerHTML = this.battleHtml(fake(), false, true);
        await sleep(70);
        if (!this.ctx.alive(epoch)) return;
      }
    }
    this.battleView.innerHTML = this.battleHtml(b, true, false);
    if (audible) sound.verdict();
  }

  private battleHtml(b: Battle, reveal: boolean, rolling: boolean): string {
    const size = Math.round(Math.min(130, Math.max(70, window.innerHeight * 0.11)));
    const rows = b.attacker
      .map((a, i) => {
        const d = b.defender[i];
        const compared = d !== undefined;
        const attWon = b.comparisons[i];
        const verdictHtml = !compared
          ? `<span class="cmp unused">not compared</span>`
          : reveal
            ? `<span class="cmp ${attWon ? 'att' : 'def'}">${
                attWon
                  ? `${ARROW_BACK}${a} beats ${d}`
                  : a === d
                    ? `tie, defender wins${ARROW}`
                    : `${d} beats ${a}${ARROW}`
              }</span>`
            : `<span class="cmp">…</span>`;
        return `<div class="bt-row ${compared ? '' : 'dim'}">
          <div class="bt-die">${dieSvg(a, size, 'p1', rolling ? 'rolling' : '')}</div>
          ${verdictHtml}
          <div class="bt-die">${compared ? dieSvg(d, size, 'p2', rolling ? 'rolling' : '') : ''}</div>
        </div>`;
      })
      .join('');
    const outcome = reveal
      ? `<div class="bt-outcome"><span class="outcome outcome--${b.outcome}">${LABELS[b.outcome]}</span></div>`
      : `<div class="bt-outcome"><span class="outcome outcome--pending">&nbsp;</span></div>`;
    return `<div class="battle">
      <div class="bt-head"><span class="who who--p1">Attacker · 3 dice</span><span></span><span class="who who--p2">Defender · 2 dice</span></div>
      ${rows}
    </div>${outcome}<div class="hint">Press R to roll another battle.</div>`;
  }

  // ---- steps 1–5: bars ----------------------------------------------------

  /** `zoom` 0 → bars on 0–100%; 1 → dots on an axis just wide enough for every whisker and exact line. */
  private barData(
    agg: DuelAggregate | undefined,
    exact: DuelExact | undefined,
    exactAlpha: number,
    zoom = 0,
  ): BarChartData {
    const n = agg?.n ?? 0;
    const bars = DUEL_OUTCOMES.map((o) => {
      const w = wilson(agg ? agg[o] : 0, n);
      return { label: LABELS[o], color: COLORS[o], p: w.p, lo: w.lo, hi: w.hi, exact: exact ? exact[o].p : NaN };
    });
    let zMin = 0;
    let zMax = 1;
    if (zoom > 0 && n > 0) {
      const vals = bars.flatMap((b) => [b.lo, b.hi, b.exact]).filter(Number.isFinite);
      zMin = Math.max(0, Math.floor((Math.min(...vals) - 0.02) / 0.05) * 0.05);
      zMax = Math.min(1, Math.ceil((Math.max(...vals) + 0.02) / 0.05) * 0.05);
    }
    return { n, exactAlpha, zoom, yMin: zoom * zMin, yMax: 1 + zoom * (zMax - 1), bars };
  }

  private marginSub(agg: DuelAggregate): string {
    const worst = Math.max(...DUEL_OUTCOMES.map((o) => wilson(agg[o], agg.n).marginPP));
    return `Whiskers = 95% confidence interval: up to ± ${fx(worst)} pp at n = ${formatInt(agg.n)}.`;
  }

  private async renderBars(step: number, prevStep: number, info: EnterInfo): Promise<void> {
    const epoch = this.ctx.epoch;
    const ctx = this.ctx;
    const target = STEP_N[step];
    const showExact = step === EXACT_STEP;
    if (step === PREDICT_STEP) {
      // No data yet: the outcomes with question marks, so the room commits before the reveal.
      await this.bars.set(this.barData(undefined, undefined, 0), info.animate ? 500 : 0);
      return;
    }
    if (!this.bars.current) await this.bars.set(this.barData(undefined, undefined, 0));
    const [snaps, exact] = await Promise.all([this.getTrace(), this.getExact()]);
    if (!ctx.alive(epoch)) return;

    const setN = async (n: number, ms: number, alpha: number, zoom = 0) => {
      const agg = snaps.get(n)!;
      if (step < EXACT_STEP) ctx.setSub(this.marginSub(agg));
      await this.bars.set(this.barData(agg, exact, alpha, zoom), ms);
    };

    if (info.animate && info.direction === 'rerun' && !showExact) {
      // Replay the whole cumulative sequence 1 → 10 → ... → target.
      const frames = showBatches(target).map((n) => ({ n, data: n }));
      if (await playBuildUp(ctx, epoch, frames, (n, ms) => setN(n, ms, 0), { noun: NOUN, tweenMs: 600, holdMs: 700 })) {
        sound.verdict();
      }
    } else if (info.animate && showExact) {
      // Exact lines fade in on the familiar 0–100% bars, then the axis zooms in so the
      // whiskers are big enough to see whether each exact line falls inside them.
      if (prevStep === EXACT_STEP) await setN(target, 0, 0, 0);
      if (!(await ctx.wait(300, epoch))) return;
      sound.verdict();
      await setN(target, 900, 1, 0);
      if (!(await ctx.wait(600, epoch))) return;
      await setN(target, 1100, 1, 1);
    } else {
      if (info.animate) sound.tick();
      await setN(target, info.animate ? 700 : 0, showExact ? 1 : 0, showExact ? 1 : 0);
    }
  }

  // ---- step 6: convergence --------------------------------------------------

  private async renderConv(animate: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const [snaps, exact] = await Promise.all([this.getTrace(), this.getExact()]);
    if (!this.ctx.alive(epoch)) return;
    const points = [...snaps.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, agg]) => {
        const w = wilson(agg.attackerWinsBoth, n);
        return { n, p: w.p, lo: w.lo, hi: w.hi };
      });
    const data = (revealLog: number): ConvergenceData => ({
      points,
      exact: exact.attackerWinsBoth.p,
      revealLog,
      xMax: TRACE_N,
      color: 'var(--p1)',
      label: 'Attacker wins both',
    });
    if (animate) {
      await this.conv.set(data(0), 0);
      sound.runStart();
      this.ctx.setReplay(`Replaying all ${formatInt(TRACE_N)} battles in order`);
      await this.conv.set(data(Math.log10(TRACE_N)), 5000);
      if (!this.ctx.alive(epoch)) return;
      this.ctx.setReplay(null);
      sound.verdict();
    } else {
      await this.conv.set(data(Math.log10(TRACE_N)), 0);
    }
  }
}
