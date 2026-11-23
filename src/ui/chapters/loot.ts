import { showBatches, stableStringify } from '../../core/engine';
import { isCancelled } from '../../core/runner';
import {
  assess,
  formatInt,
  histPercentile,
  LOOT_TARGET,
  meanCI,
  meanInterval,
  NOT_ENOUGH_DATA,
  type AssessmentStatus,
} from '../../core/stats';
import { exactLoot, loot, type LootAggregate, type LootConfig, type LootExact } from '../../games/loot';
import { sound } from '../audio';
import { playBuildUp } from '../buildUp';
import { ChartHost } from '../charts/host';
import { renderWait, waitShares, waitYMax, type WaitChartData } from '../charts/waitChart';
import { MATCH_N } from '../match';
import type { AppContext, Chapter, EnterInfo, StepDef } from '../types';
import { el, esc, fx } from '../util';

const N = MATCH_N;
const NOUN = { one: 'player', many: 'players' };
const PLAIN: LootConfig = { ...loot.defaultConfig, dropPercent: 5, pity: 0 };
const PITY = 40;
const X_MAX = 120;
const TARGET = LOOT_TARGET;

/** Step index → the rule it starts from and whether the drop-chance slider is live. */
const STEP_SETUP: { config: LootConfig; slider: boolean; predict?: boolean }[] = [
  { config: PLAIN, slider: false, predict: true },
  { config: PLAIN, slider: false },
  { config: { ...PLAIN, pity: PITY }, slider: false },
  { config: { ...PLAIN, pity: PITY }, slider: true },
];

const VERDICT_CLASS: Record<AssessmentStatus, string> = { on: 'fair', below: 'off', above: 'off', unclear: 'unclear' };

const droughtNote = (p99: number) =>
  `Same 5% for everyone, yet 1 player in 100 needs ${p99} tries or more. Players remember the drought, not the average.`;
const pityNote = (mean: number) => `No more droughts, but the average fell to ${fx(mean)} tries: the sword is easier to get than designed.`;

/** The tries by which 99 players in 100 have the drop, written "89+" when some needed more. */
const tail = (k: number, max: number) => (max > k ? `${k}+` : String(k));

/** Chapter: how randomness feels. Same odds for everyone, very different waits; a pity timer as the fix. */
export class LootChapter implements Chapter {
  id = 'loot';
  title = 'Loot Drops and Pity Timers';
  minutes = 2;
  showsStats = true;
  steps: StepDef[] = [
    {
      caption: 'A rare sword drops 5% of the time. How long until you get it?',
      sub: 'On average, 20 tries. Predict: how many tries does the unluckiest player in 100 need?',
      activity: true,
    },
    { caption: '10,000 players farm for the sword.', subVariants: [droughtNote(199)] },
    { caption: `Fix: a pity timer. The sword is guaranteed on try ${PITY}.`, subVariants: [pityNote(17.4)] },
    {
      caption: 'Now lower the drop chance (−) until the average is 20 again.',
      takeaway: 'Players feel the worst case, not the average. Tune the average and the droughts together.',
    },
  ];

  private ctx!: AppContext;
  private step = 0;
  private cfg: LootConfig = PLAIN;
  private token = 0;
  private cache = new Map<string, Promise<LootAggregate>>();
  private slider!: HTMLInputElement;
  private sliderOut!: HTMLElement;
  private sliderBox!: HTMLElement;
  private chip!: HTMLElement;
  private stats!: HTMLElement;
  private chart!: ChartHost<WaitChartData>;

  mount(stage: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    stage.classList.add('ch-loot');
    const view = el('div', { class: 'view result-view loot-view' });
    const controls = el('div', { class: 'controls' });
    controls.innerHTML = `
      <label class="ctl" data-ctl="drop">
        <span class="ctl-name">Drop chance</span>
        <input type="range" min="1" max="10" step="1" value="5" aria-label="Drop chance per try, in percent">
        <output class="ctl-val">5</output><span class="ctl-unit">% per try</span>
      </label>
      <div class="rules-chip"></div>`;
    this.sliderBox = controls.querySelector('.ctl')!;
    this.slider = controls.querySelector('input')!;
    this.sliderOut = controls.querySelector('output')!;
    this.chip = controls.querySelector('.rules-chip')!;
    this.slider.addEventListener('input', () => this.setDrop(Number(this.slider.value)));
    this.slider.addEventListener('change', () => this.slider.blur());
    this.stats = el('div', { class: 'loot-stats' });
    const host = el('div', { class: 'chart-host wait-host' });
    view.append(controls, this.stats, host);
    stage.append(view);
    this.chart = new ChartHost(host, renderWait);
  }

  reseed(): void {
    this.cache.clear();
  }

  private agg(c: LootConfig): Promise<LootAggregate> {
    const k = stableStringify(c);
    let p = this.cache.get(k);
    if (!p) {
      p = this.ctx.runner.run<LootAggregate>(loot.id, c, N, this.ctx.seed);
      const pp = p;
      p.catch(() => this.cache.get(k) === pp && this.cache.delete(k));
      this.cache.set(k, p);
    }
    return p;
  }

  enter(step: number, info: EnterInfo): void {
    this.step = step;
    const setup = STEP_SETUP[step];
    this.cfg = setup.config;
    this.sync();
    const go = async () => {
      if (setup.predict) this.renderPredict();
      else await this.run(info.animate, info.direction !== 'backward');
    };
    go().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  adjust(delta: number): void {
    if (!STEP_SETUP[this.step].slider) return;
    this.setDrop(this.cfg.dropPercent + delta);
  }

  private setDrop(v: number): void {
    const d = Math.max(1, Math.min(10, v));
    if (d === this.cfg.dropPercent) return;
    this.cfg = { ...this.cfg, dropPercent: d };
    this.sync();
    // A tweak: update straight away (plan D8).
    this.run(false, true).catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  private sync(): void {
    this.sliderBox.hidden = !STEP_SETUP[this.step].slider;
    this.slider.value = String(this.cfg.dropPercent);
    this.sliderOut.textContent = String(this.cfg.dropPercent);
    this.chip.textContent = `Rules: ${this.cfg.dropPercent}% per try · ${this.cfg.pity ? `guaranteed on try ${this.cfg.pity}` : 'no pity timer'}`;
  }

  // ---- rendering ------------------------------------------------------------------------------

  private stat(label: string, big: string, small: string, extra = ''): string {
    return `<div class="ls-stat"><div class="ls-label">${label}</div><div class="ls-big">${big}</div><div class="ls-small">${small}</div>${extra}</div>`;
  }

  private renderPredict(): void {
    this.token++;
    this.stats.innerHTML =
      this.stat('Average', '?', 'tries', '<div class="verdict" style="visibility:hidden">&nbsp;</div>') +
      this.stat('Half the players have it by', '?', 'tries') +
      this.stat('1 player in 100 needs', '?', 'your guess first') +
      this.stat('Unluckiest player', '?', 'tries');
    void this.chart.set(
      { cur: new Array(X_MAX + 1).fill(0), ref: null, over: 0, yMax: 0.1, xMax: X_MAX, markers: [], curLabel: 'Players (none yet)', refLabel: '' },
      0,
    );
  }

  private async run(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const token = ++this.token;
    const live = () => this.ctx.alive(epoch) && token === this.token;
    const cfg = this.cfg;
    const exact = exactLoot(cfg);
    const withRef = cfg.pity > 0;
    const ref = withRef ? await this.agg(PLAIN) : undefined;
    if (!live()) return;
    if (animate) {
      const snaps: LootAggregate[] = [];
      const p = this.ctx.runner.run<LootAggregate>(loot.id, cfg, N, this.ctx.seed, (pr) => pr.checkpoint && snaps.push(pr.aggregate), {
        checkpoints: showBatches(N),
      });
      const k = stableStringify(cfg);
      this.cache.set(k, p);
      p.catch(() => this.cache.get(k) === p && this.cache.delete(k));
      const final = await p;
      if (!live()) return;
      const frames = [...snaps, final].map((agg) => ({ n: agg.n, data: agg }));
      const done = await playBuildUp(this.ctx, epoch, frames, (agg, ms) => this.render(agg, exact, ref, ms, agg === final), {
        noun: NOUN,
        alive: live,
      });
      if (done) sound.verdict();
    } else {
      const agg = await this.agg(cfg);
      if (!live()) return;
      this.render(agg, exact, ref, 300, true);
      if (audible) sound.verdict();
    }
  }

  private render(agg: LootAggregate, exact: LootExact, ref: LootAggregate | undefined, ms: number, final: boolean): void {
    const m = meanCI(agg.sum, agg.sumSq, agg.n);
    // One player has no spread to measure: that is "not enough data", not "± 0".
    const a = agg.n > 1 ? assess(meanInterval(m), TARGET) : { ...assess(meanInterval(m), TARGET), status: 'unclear' as const, label: NOT_ENOUGH_DATA };
    const median = histPercentile(agg.hist, 0.5);
    const p99 = histPercentile(agg.hist, 0.99);
    const math = (x: string) => `<span class="exact-inline">math: ${x}</span>`;
    const verdict = `<div class="verdict ${VERDICT_CLASS[a.status]}">${esc(a.label)}</div>`;
    const exactTail = exact.dist.length - 1 > exact.p99 ? `${exact.p99}+` : String(exact.p99);
    this.stats.innerHTML =
      this.stat('Average', fx(m.mean), `${agg.n > 1 ? `± ${fx(m.margin)}` : '± —'} tries · ${math(fx(exact.mean))}`, verdict) +
      this.stat('Half the players have it by', String(median), `tries · ${math(String(exact.median))}`) +
      this.stat('1 player in 100 needs', tail(p99, agg.max), `tries · ${math(exactTail)}`) +
      this.stat('Unluckiest player', String(agg.max), `tries, of ${formatInt(agg.n)}`);
    const cur = waitShares(agg.hist, X_MAX);
    const refShares = ref ? waitShares(ref.hist, X_MAX).shares : null;
    void this.chart.set(
      {
        cur: cur.shares,
        ref: refShares,
        over: cur.over,
        // The pity try's spike would flatten every other bar: the axis fits the rest and the spike is cut.
        yMax: waitYMax([cur.shares, refShares], agg.n >= 100 ? this.cfg.pity : 0),
        xMax: X_MAX,
        markers: [
          { x: m.mean, label: `Average: ${fx(m.mean)}` },
          { x: p99, label: `1 in 100: ${tail(p99, agg.max)}` },
        ],
        curLabel: `${formatInt(agg.n)} ${agg.n === 1 ? NOUN.one : NOUN.many}, ${this.cfg.dropPercent}%${this.cfg.pity ? ` with pity at ${this.cfg.pity}` : ''}`,
        refLabel: '5% without pity',
      },
      ms,
    );
    if (!final) return;
    if (this.step === 1) this.ctx.setSub(droughtNote(p99), { tone: 'note' });
    else if (this.step === 2 && a.status === 'below') this.ctx.setSub(pityNote(m.mean), { tone: 'note' });
  }
}
