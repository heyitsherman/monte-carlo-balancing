import { stableStringify } from '../../core/engine';
import { isCancelled } from '../../core/runner';
import { createRng } from '../../core/rng';
import { assess, FAIR_TARGET, meanCI, wilson, type Target } from '../../core/stats';
import { playTurn, pushLuck, turnExact, type LuckAggregate, type LuckConfig, type RollEvent } from '../../games/pushLuck';
import { sound } from '../audio';
import { dieSvg } from '../charts/dice';
import { renderDotSweep, type DotSweepData } from '../charts/dotSweep';
import { ChartHost } from '../charts/host';
import { MATCH_N, MatchPanel, matchPromptVariants } from '../match';
import type { AppContext, Chapter, EnterInfo, StepDef } from '../types';
import { el, esc, fx } from '../util';

const BASE: LuckConfig = pushLuck.defaultConfig;
const NOUN = { one: 'game', many: 'games' };

/** The three bots. Careful and greedy look balanced against each other; smart beats both. */
type BotId = 'careful' | 'greedy' | 'smart';
const BOTS: Record<BotId, { name: string; holdAt: number; tone: 'p1' | 'p2' | 'ink' }> = {
  careful: { name: 'Careful', holdAt: 10, tone: 'p1' },
  greedy: { name: 'Greedy', holdAt: 30, tone: 'p2' },
  smart: { name: 'Smart', holdAt: 20, tone: 'ink' },
};
const match = (a: BotId, b: BotId): LuckConfig => ({
  ...BASE,
  aStrategy: 'holdAt',
  aHoldAt: BOTS[a].holdAt,
  bStrategy: 'holdAt',
  bHoldAt: BOTS[b].holdAt,
});
const MATCHES: [BotId, BotId][] = [
  ['careful', 'greedy'],
  ['smart', 'careful'],
  ['smart', 'greedy'],
];
const THRESHOLDS = [5, 10, 15, 20, 25, 30, 35, 40];

const CAREFUL_VS_GREEDY: Target = { ...FAIR_TARGET, labels: { below: 'Favors greedy', on: 'Fair', above: 'Favors careful' } };
const PROMPTS = matchPromptVariants(CAREFUL_VS_GREEDY, 'fair', NOUN.many);
const ROBIN_NOTE = 'Smart beats both. The first test said “balanced” only because neither bot played well.';

/** Chapter: a dominant strategy exists, and simulation finds it. */
export class LuckChapter implements Chapter {
  id = 'luck';
  title = 'Push Your Luck';
  minutes = 2;
  showsStats = true;
  steps: StepDef[] = [
    {
      caption: 'Push your luck: roll as often as you dare.',
      sub: `Each roll adds to your turn. Roll a 1 and the turn scores nothing. Bank whenever you like; first to ${BASE.goal} wins.`,
    },
    {
      caption: 'Predict: a careful bot or a greedy one?',
      sub: 'Careful banks once its turn reaches 10 points. Greedy keeps rolling until 30. Which wins more often?',
      activity: true,
    },
    {
      caption: 'Careful against greedy, 10,000 games.',
      sub: 'A coin decides who goes first, so only the plans are compared.',
      subVariants: PROMPTS,
    },
    {
      caption: 'A third bot banks at 20. Who wins now?',
      sub: 'Each match: 10,000 games, coin toss for the first turn.',
      subVariants: [ROBIN_NOTE],
    },
    {
      caption: 'Where should you bank? Try every threshold.',
      takeaway: 'If one plan always wins, the choice is gone. Simulate smart bots to find it before your players do.',
    },
  ];

  private ctx!: AppContext;
  private step = 0;
  private demoCount = 0;

  labLink() {
    const config = this.step === 3 ? match('smart', 'careful') : this.step === 4 ? { ...BASE, aHoldAt: 20, bHoldAt: 20 } : match('careful', 'greedy');
    return { game: 'pushLuck', config };
  }
  private cache = new Map<string, Promise<LuckAggregate>>();
  private turnView!: HTMLElement;
  private matchView!: HTMLElement;
  private robinView!: HTMLElement;
  private sweepView!: HTMLElement;
  private panel!: MatchPanel<LuckAggregate>;
  private sweepChart!: ChartHost<DotSweepData>;

  mount(stage: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    stage.classList.add('ch-luck');
    this.turnView = el('div', { class: 'view luck-turn-view' });
    this.matchView = el('div', { class: 'view result-view' });
    this.robinView = el('div', { class: 'view robin-view' });
    this.sweepView = el('div', { class: 'view chart-host sweep-host' });
    stage.append(this.turnView, this.matchView, this.robinView, this.sweepView);
    this.panel = new MatchPanel<LuckAggregate>(ctx, {
      gameId: pushLuck.id,
      left: { name: BOTS.careful.name, tone: 'p1' },
      right: { name: BOTS.greedy.name, tone: 'p2' },
      leftWins: (a) => a.aWins,
      runs: (a) => a.n,
      leftExact: () => NaN,
      measure: 'left',
      target: CAREFUL_VS_GREEDY,
      onWord: 'fair',
      noun: NOUN,
    });
    this.matchView.append(this.panel.el);
    this.sweepChart = new ChartHost(this.sweepView, renderDotSweep);
  }

  reseed(): void {
    this.cache.clear();
    this.demoCount = 0;
    this.panel.reseed();
    this.sweepChart.clear();
  }

  private agg(c: LuckConfig): Promise<LuckAggregate> {
    const k = stableStringify(c);
    let p = this.cache.get(k);
    if (!p) {
      p = this.ctx.runner.run<LuckAggregate>(pushLuck.id, c, MATCH_N, this.ctx.seed);
      const pp = p;
      p.catch(() => this.cache.get(k) === pp && this.cache.delete(k));
      this.cache.set(k, p);
    }
    return p;
  }

  enter(step: number, info: EnterInfo): void {
    this.step = step;
    this.panel.stop();
    const view = ['turn', 'match', 'match', 'robin', 'sweep'][step];
    this.turnView.hidden = view !== 'turn';
    this.matchView.hidden = view !== 'match';
    this.robinView.hidden = view !== 'robin';
    this.sweepView.hidden = view !== 'sweep';
    const audible = info.direction !== 'backward';
    const go = async () => {
      if (step === 0) {
        if (info.direction === 'rerun') this.demoCount++;
        await this.playDemo(info.animate, audible);
      } else if (step === 1) {
        this.panel.renderPredict();
      } else if (step === 2) {
        await this.panel.show(match('careful', 'greedy'), { animate: info.animate, audible });
      } else if (step === 3) {
        await this.runRobin(info.animate, audible);
      } else {
        await this.runSweep(info.animate, audible);
      }
    };
    go().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  onKey(key: string): boolean {
    return this.panel.onKey(key);
  }

  // ---- step 1: one turn, roll by roll -------------------------------------------------------

  private async playDemo(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    // Alternate the two bots on R: greedy first (it busts more often, which is the point of the game).
    const bot = this.demoCount % 2 === 0 ? BOTS.greedy : BOTS.careful;
    const tone = bot.tone === 'p2' ? 'p2' : 'p1';
    const plan = { strategy: 'holdAt' as const, holdAt: bot.holdAt, rolls: 1 };
    let rolls: RollEvent[] = [];
    let banked = 0;
    // The opening turn is the first in the demo stream with a few rolls to watch (a bust on roll one
    // explains nothing); R then shows the turns that follow, whatever they are.
    for (let k = this.demoCount; k < this.demoCount + 50; k++) {
      rolls = [];
      banked = playTurn(plan, createRng(`${this.ctx.seed}|luck-demo|${k}`), (e) => rolls.push(e));
      if (this.demoCount > 0 || rolls.length >= 3) {
        this.demoCount = k;
        break;
      }
    }
    this.turnView.innerHTML = `
      <div class="luck-turn">
        <p class="lt-who"><span class="who who--${tone}">${bot.name}</span> keeps rolling until its turn reaches ${bot.holdAt} points.</p>
        <div class="lt-dice" aria-live="off"></div>
        <div class="lt-total"><span class="lt-num">0</span><span class="lt-label">points this turn</span></div>
        <div class="turn-text">Rolling…</div>
      </div>
      <div class="hint">Press R to play another turn.</div>`;
    const diceEl = this.turnView.querySelector<HTMLElement>('.lt-dice')!;
    const numEl = this.turnView.querySelector<HTMLElement>('.lt-num')!;
    const textEl = this.turnView.querySelector<HTMLElement>('.turn-text')!;
    const labelEl = this.turnView.querySelector<HTMLElement>('.lt-label')!;
    const rollMs = animate ? 650 : 220;
    if (!(await this.ctx.wait(animate ? 500 : 120, epoch))) return;
    for (const r of rolls) {
      diceEl.insertAdjacentHTML('beforeend', dieSvg(r.roll, 60, tone, r.bust ? 'die--bust' : ''));
      // A bust leaves the lost total on screen, struck through.
      if (!r.bust) numEl.textContent = String(r.total);
      const lost = r.bust && numEl.textContent !== '0';
      numEl.classList.toggle('is-bust', lost);
      labelEl.textContent = lost ? 'points lost' : 'points this turn';
      textEl.textContent = r.bust ? 'Rolled a 1!' : `Rolled ${r.roll}. Total ${r.total}.`;
      if (audible) sound.dice();
      if (!(await this.ctx.wait(rollMs, epoch))) return;
    }
    textEl.innerHTML = banked
      ? `<b>Banked ${banked} points.</b> ${rolls.length} rolls without a 1.`
      : rolls.length > 1
        ? `<b>Bust: the turn scores nothing.</b> ${rolls.length - 1} good roll${rolls.length === 2 ? '' : 's'} wasted.`
        : '<b>Bust on the first roll: the turn scores nothing.</b>';
    if (audible) sound.verdict();
  }

  // ---- step 4: round robin ------------------------------------------------------------------

  private robinRow(a: BotId, b: BotId, agg?: LuckAggregate): string {
    const A = BOTS[a];
    const B = BOTS[b];
    const names = `<span class="who who--${A.tone}">${A.name}</span><span class="mu-vs">banks at ${A.holdAt}, against</span><span class="who who--${B.tone}">${B.name}</span><span class="mu-vs">banks at ${B.holdAt}</span>`;
    if (!agg) {
      return `<div class="mu-row is-empty"><div class="mu-names">${names}</div><div class="mu-bar"></div><div class="mu-result">&nbsp;</div></div>`;
    }
    const w = wilson(agg.aWins, agg.n);
    const status = assess(w, FAIR_TARGET).status;
    const verdict = status === 'on' ? 'About even' : status === 'above' ? `${A.name} wins more` : status === 'below' ? `${B.name} wins more` : 'Not enough data';
    const left = fx(w.p * 100);
    const right = fx(100 - Number(left));
    return `<div class="mu-row"><div class="mu-names">${names}</div>
      <div class="mu-bar" role="img" aria-label="${esc(`${A.name} wins ${left}%, ${B.name} wins ${right}%`)}">
        <div class="mu-seg mu-seg--${A.tone}" style="width:${left}%"><span>${left}%</span></div>
        <div class="mu-seg mu-seg--${B.tone}"><span>${right}%</span></div>
      </div>
      <div class="mu-result"><span class="mu-verdict">${verdict}</span><span class="mu-ci">± ${fx(w.marginPP)} pp</span></div></div>`;
  }

  private async runRobin(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const shown: (LuckAggregate | undefined)[] = MATCHES.map(() => undefined);
    const draw = () => {
      this.robinView.innerHTML = `<div class="mu-list">${MATCHES.map(([a, b], i) => this.robinRow(a, b, shown[i])).join('')}</div>`;
    };
    draw();
    const aggs = await Promise.all(MATCHES.map(([a, b]) => this.agg(match(a, b))));
    if (!this.ctx.alive(epoch)) return;
    if (animate) {
      // Like a sweep: the matches appear one at a time.
      sound.runStart();
      for (let i = 0; i < aggs.length; i++) {
        if (!(await this.ctx.wait(i === 0 ? 300 : 650, epoch))) return;
        shown[i] = aggs[i];
        draw();
        sound.tick();
      }
    } else {
      aggs.forEach((a, i) => (shown[i] = a));
      draw();
    }
    const smartWins = aggs.slice(1).every((a) => assess(wilson(a.aWins, a.n), FAIR_TARGET).status === 'above');
    if (smartWins) this.ctx.setSub(ROBIN_NOTE, { tone: 'note' });
    if (audible) sound.verdict();
  }

  // ---- step 5: points per turn for every bank threshold ---------------------------------------

  private async runSweep(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    // Mirror matches: each bot's turns are independent of the other bot, so bot A's average is the plan's.
    const aggs = await Promise.all(THRESHOLDS.map((h) => this.agg({ ...BASE, aHoldAt: h, bHoldAt: h })));
    if (!this.ctx.alive(epoch)) return;
    const means = aggs.map((a) => meanCI(a.aPtsSum, a.aPtsSumSq, a.aTurns));
    const best = means.reduce((bi, m, i) => (m.mean > means[bi].mean ? i : bi), 0);
    const points = means.map((m, i) => ({
      value: m.mean,
      lo: m.mean - m.margin,
      hi: m.mean + m.margin,
      exact: turnExact({ strategy: 'holdAt', holdAt: THRESHOLDS[i], rolls: 1 }).perTurn,
      tone: i === best ? ('best' as const) : ('ink' as const),
      sub: `± ${fx(m.margin, 2)}`,
    }));
    const base: Omit<DotSweepData, 'points'> = {
      xs: THRESHOLDS.map(String),
      yMin: 4,
      yMax: 9,
      yStep: 1,
      yFormat: (v) => String(v),
      valueFormat: (v) => fx(v, 2),
      xLabel: `Bank when the turn reaches … points — points per turn, each from ${MATCH_N.toLocaleString('en-US')} games`,
      band: null,
      legend: [
        { mark: 'ink', label: 'Simulated' },
        { mark: 'best', label: 'Most points per turn' },
        { mark: 'exact', label: 'Exact' },
      ],
      aria: 'Average points per turn for each bank threshold, with 95% confidence intervals and exact values',
    };
    if (animate) {
      sound.runStart();
      for (let i = 1; i <= points.length; i++) {
        // The best dot is only marked once every threshold is in.
        const shown = points.slice(0, i).map((p) => (i < points.length && p.tone === 'best' ? { ...p, tone: 'ink' as const } : p));
        await this.sweepChart.set({ ...base, points: shown }, 0);
        sound.tick();
        if (!(await this.ctx.wait(450, epoch))) return;
      }
    } else {
      await this.sweepChart.set({ ...base, points }, 0);
    }
    if (audible) sound.verdict();
  }
}
