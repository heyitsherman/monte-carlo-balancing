import { stableStringify } from '../../core/engine';
import { isCancelled } from '../../core/runner';
import { formatInt, SKILL_TARGET, wilson } from '../../core/stats';
import { bestOf, exactBestOf, shortestSeries, type BestOfAggregate, type BestOfConfig, type BestOfExact } from '../../games/bestOf';
import { sound } from '../audio';
import { renderDotSweep, type DotSweepData } from '../charts/dotSweep';
import { ChartHost } from '../charts/host';
import { MATCH_N, MatchPanel, matchPromptVariants } from '../match';
import type { AppContext, Chapter, EnterInfo, StepDef } from '../types';
import { el, fx } from '../util';

const BASE: BestOfConfig = bestOf.defaultConfig;
const NOUN = { one: 'series', many: 'series' };
const LENGTHS = [1, 3, 5, 7, 9, 15, 21, 31, 45, 61];
const GOAL = SKILL_TARGET.center - SKILL_TARGET.tolerance;
const PROMPTS = matchPromptVariants(SKILL_TARGET, 'skill wins', NOUN.many);

/** Chapter: skill versus luck. How long a series must be before a small edge shows. */
export class BestOfChapter implements Chapter {
  id = 'bestof';
  title = 'Best of N';
  minutes = 1.75;
  showsStats = true;
  steps: StepDef[] = [
    {
      caption: `Predict: win ${BASE.edgePercent}% of games. How often do you win a best-of-7?`,
      sub: 'You are the stronger player: five points better than a coin flip in every game. Commit to a number before we run it.',
      activity: true,
    },
    {
      caption: 'Play 10,000 best-of-7 series.',
      sub: 'Target: the stronger player wins at least 3 series in 4. Press + / − to change the length.',
      subVariants: PROMPTS,
    },
    {
      caption: 'How long must the series be for skill to win 3 times in 4?',
      takeaway: 'Small edges drown in luck. Long seasons reward skill; a short series is a choice for drama.',
    },
  ];

  private ctx!: AppContext;
  private step = 0;
  private cfg: BestOfConfig = BASE;

  labLink() {
    return { game: 'bestOf', config: this.cfg };
  }
  private cache = new Map<string, Promise<BestOfAggregate>>();
  private matchView!: HTMLElement;
  private sweepView!: HTMLElement;
  private sliderBox!: HTMLElement;
  private slider!: HTMLInputElement;
  private sliderOut!: HTMLElement;
  private chip!: HTMLElement;
  private panel!: MatchPanel<BestOfAggregate>;
  private sweepChart!: ChartHost<DotSweepData>;

  mount(stage: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    stage.classList.add('ch-bestof');
    this.matchView = el('div', { class: 'view result-view' });
    this.sweepView = el('div', { class: 'view chart-host sweep-host' });
    stage.append(this.matchView, this.sweepView);
    const controls = el('div', { class: 'controls' });
    controls.innerHTML = `
      <label class="ctl" data-ctl="length">
        <span class="ctl-name">Best of</span>
        <input type="range" min="1" max="99" step="2" value="7" aria-label="Series length: best of this many games">
        <output class="ctl-val">7</output><span class="ctl-unit">games</span>
      </label>
      <div class="rules-chip"></div>`;
    this.sliderBox = controls.querySelector('.ctl')!;
    this.slider = controls.querySelector('input')!;
    this.sliderOut = controls.querySelector('output')!;
    this.chip = controls.querySelector('.rules-chip')!;
    this.slider.addEventListener('input', () => this.setLength(Number(this.slider.value)));
    this.slider.addEventListener('change', () => this.slider.blur());
    this.panel = new MatchPanel<BestOfAggregate>(ctx, {
      gameId: bestOf.id,
      left: { name: 'Stronger', tone: 'p1' },
      right: { name: 'Weaker', tone: 'p2' },
      leftWins: (a) => a.strongerWins,
      runs: (a) => a.n,
      leftExact: (e) => (e as BestOfExact).strongerWin,
      measure: 'left',
      target: SKILL_TARGET,
      onWord: 'skill wins',
      noun: NOUN,
      bandText: 'Skill wins: 75% or more',
    });
    this.matchView.append(controls, this.panel.el);
    this.sweepChart = new ChartHost(this.sweepView, renderDotSweep);
  }

  reseed(): void {
    this.cache.clear();
    this.panel.reseed();
    this.sweepChart.clear();
  }

  enter(step: number, info: EnterInfo): void {
    this.step = step;
    this.panel.stop();
    this.matchView.hidden = step === 2;
    this.sweepView.hidden = step !== 2;
    // Keep the presenter's length when re-running step 2; otherwise start from best-of-7.
    if (!(step === 1 && info.direction === 'rerun')) this.cfg = BASE;
    this.sync();
    const audible = info.direction !== 'backward';
    const go = async () => {
      if (step === 0) this.panel.renderPredict();
      else if (step === 1) await this.panel.show(this.cfg, { animate: info.animate, audible });
      else await this.runSweep(info.animate, audible);
    };
    go().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  adjust(delta: number): void {
    if (this.step === 1) this.setLength(this.cfg.bestOf + 2 * delta);
  }

  onKey(key: string): boolean {
    return this.panel.onKey(key);
  }

  private setLength(v: number): void {
    const n = Math.max(1, Math.min(99, v));
    if (n === this.cfg.bestOf) return;
    this.cfg = { ...this.cfg, bestOf: n };
    this.sync();
    this.panel.show(this.cfg, { animate: false, audible: true }).catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  private sync(): void {
    this.sliderBox.hidden = this.step !== 1;
    this.slider.value = String(this.cfg.bestOf);
    this.sliderOut.textContent = String(this.cfg.bestOf);
    this.chip.textContent = `Rules: stronger player wins ${this.cfg.edgePercent}% of games · best of ${this.cfg.bestOf}`;
  }

  private agg(c: BestOfConfig): Promise<BestOfAggregate> {
    const k = stableStringify(c);
    let p = this.cache.get(k);
    if (!p) {
      p = this.ctx.runner.run<BestOfAggregate>(bestOf.id, c, MATCH_N, this.ctx.seed);
      const pp = p;
      p.catch(() => this.cache.get(k) === pp && this.cache.delete(k));
      this.cache.set(k, p);
    }
    return p;
  }

  private async runSweep(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const aggs = await Promise.all(LENGTHS.map((n) => this.agg({ ...BASE, bestOf: n })));
    if (!this.ctx.alive(epoch)) return;
    const shortest = shortestSeries(BASE.edgePercent, GOAL);
    const points = aggs.map((a, i) => {
      const w = wilson(a.strongerWins, a.n);
      return {
        value: w.p,
        lo: w.lo,
        hi: w.hi,
        exact: exactBestOf({ ...BASE, bestOf: LENGTHS[i] }).strongerWin,
        tone: LENGTHS[i] === shortest ? ('best' as const) : ('p1' as const),
        sub: `± ${fx(w.marginPP)} pp`,
      };
    });
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const base: Omit<DotSweepData, 'points'> = {
      xs: LENGTHS.map(String),
      yMin: 0.5,
      yMax: 0.85,
      yStep: 0.05,
      yFormat: pct,
      valueFormat: (v) => `${fx(v * 100)}%`,
      xLabel: `Best of … games — stronger player's series wins, each from ${formatInt(MATCH_N)} series`,
      band: { lo: GOAL, hi: 0.85, label: 'Skill wins: 75% or more' },
      legend: [
        { mark: 'p1', label: 'Simulated' },
        { mark: 'best', label: `Shortest that reaches 75%: best of ${shortest}` },
        { mark: 'exact', label: 'Exact' },
      ],
      aria: "The stronger player's share of series won for each series length, with 95% confidence intervals and exact values",
    };
    if (animate) {
      sound.runStart();
      for (let i = 1; i <= points.length; i++) {
        await this.sweepChart.set({ ...base, points: points.slice(0, i) }, 0);
        sound.tick();
        if (i < points.length && !(await this.ctx.wait(450, epoch))) return;
      }
    } else {
      await this.sweepChart.set({ ...base, points }, 0);
    }
    if (audible) sound.verdict();
  }
}
