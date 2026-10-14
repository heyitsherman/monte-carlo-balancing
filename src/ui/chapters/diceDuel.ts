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
import type { AppContext, Chapter, EnterInfo } from '../types';
import { el, fx, sleep } from '../util';

const CONFIG = diceDuel.defaultConfig;
const TRACE_N = 100_000;
/** n shown at steps 1..5 (index = step) */
const STEP_N = [0, 10, 100, 1000, 10_000, 10_000];

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

export class DiceDuelChapter implements Chapter {
  id = 'dice-duel';
  title = 'Dice Duel';
  showsStats = true;
  steps = [
    { caption: 'Attacker rolls 3 dice, defender rolls 2. Who wins?', sub: 'Sort both. Highest vs highest, second vs second. Ties go to the defender.' },
    { caption: '10 battles.' },
    { caption: '100.' },
    { caption: '1,000.' },
    { caption: '10,000.' },
    { caption: 'Now the exact math.', sub: 'Dashed lines: exact odds from all 6⁵ = 7,776 possible rolls.' },
    {
      caption: 'Noise becomes signal.',
      sub: 'Simulation agrees with the math. When the math is too ugly to do, you run the simulation instead.',
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
        await this.renderBattle(info.animate);
      } else if (step <= 5) {
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

  private async renderBattle(animate: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const b = rollBattle(CONFIG, createRng(`${this.ctx.seed}|battle|${this.battleCount}`));
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
                attWon ? `◀ ${a} beats ${d}` : a === d ? `tie → defender ▶` : `${d} beats ${a} ▶`
              }</span>`
            : `<span class="cmp">…</span>`;
        return `<div class="bt-row ${compared ? '' : 'dim'}">
          <div class="bt-die">${dieSvg(a, size, 'var(--p1)', rolling ? 'rolling' : '')}</div>
          ${verdictHtml}
          <div class="bt-die">${compared ? dieSvg(d, size, 'var(--p2)', rolling ? 'rolling' : '') : ''}</div>
        </div>`;
      })
      .join('');
    const outcome = reveal
      ? `<div class="bt-outcome" style="color:${COLORS[b.outcome]}">${LABELS[b.outcome]}</div>`
      : `<div class="bt-outcome">&nbsp;</div>`;
    return `<div class="battle">
      <div class="bt-head"><span style="color:var(--p1)">Attacker · 3 dice</span><span></span><span style="color:var(--p2)">Defender · 2 dice</span></div>
      ${rows}
    </div>${outcome}<div class="hint">Press R to roll another battle.</div>`;
  }

  // ---- steps 1–5: bars ----------------------------------------------------

  private barData(agg: DuelAggregate | undefined, exact: DuelExact | undefined, exactAlpha: number): BarChartData {
    const n = agg?.n ?? 0;
    return {
      n,
      exactAlpha,
      yMax: 1,
      bars: DUEL_OUTCOMES.map((o) => {
        const w = wilson(agg ? agg[o] : 0, n);
        return { label: LABELS[o], color: COLORS[o], p: w.p, lo: w.lo, hi: w.hi, exact: exact ? exact[o].p : NaN };
      }),
    };
  }

  private marginSub(agg: DuelAggregate): string {
    const worst = Math.max(...DUEL_OUTCOMES.map((o) => wilson(agg[o], agg.n).marginPP));
    return `Whiskers = 95% confidence interval: up to ± ${fx(worst)} pp at n = ${formatInt(agg.n)}.`;
  }

  private async renderBars(step: number, prevStep: number, info: EnterInfo): Promise<void> {
    const epoch = this.ctx.epoch;
    const ctx = this.ctx;
    const target = STEP_N[step];
    const showExact = step === 5;
    if (!this.bars.current) await this.bars.set(this.barData(undefined, undefined, 0));
    const [snaps, exact] = await Promise.all([this.getTrace(), this.getExact()]);
    if (!ctx.alive(epoch)) return;

    const setN = async (n: number, ms: number, alpha: number) => {
      const agg = snaps.get(n)!;
      if (step < 5) ctx.setSub(this.marginSub(agg));
      await this.bars.set(this.barData(agg, exact, alpha), ms);
    };

    if (info.animate && info.direction === 'rerun' && !showExact) {
      // Replay the whole cumulative sequence 1 → 10 → ... → target.
      for (const n of showBatches(target)) {
        await setN(n, 600, 0);
        if (!(await ctx.wait(700, epoch))) return;
      }
    } else if (info.animate && showExact) {
      await setN(target, 0, prevStep === 5 ? 1 : 0);
      if (!(await ctx.wait(300, epoch))) return;
      await setN(target, 900, 1);
    } else {
      await setN(target, info.animate ? 700 : 0, showExact ? 1 : 0);
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
      await this.conv.set(data(Math.log10(TRACE_N)), 5000);
    } else {
      await this.conv.set(data(Math.log10(TRACE_N)), 0);
    }
  }
}
