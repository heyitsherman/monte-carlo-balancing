/**
 * One side against another: the readout, the tug-of-war bar and the verdict against a target band, plus
 * the "Not enough data" prompt and its N key (plan D13). The race chapter grew this logic first; the
 * Phase 4 chapters (push your luck, best-of-N, the boss and the handicap) share this copy of it.
 */
import { showBatches, stableStringify } from '../core/engine';
import { isCancelled } from '../core/runner';
import {
  assess,
  formatInt,
  wilson,
  type Assessment,
  type AssessmentStatus,
  type Proportion,
  type Target,
} from '../core/stats';
import { sound } from './audio';
import { addingLabel, playBuildUp } from './buildUp';
import { ChartHost } from './charts/host';
import { renderTug, type TugData } from './charts/tugOfWar';
import { crossedEdge, resolvedLine, stillUnclearLine, unclearPrompt } from './targetNotes';
import type { AppContext } from './types';
import { el, esc, fx } from './util';

/** Runs per result on screen, and per "run more" (N). */
export const MATCH_N = 10_000;
export const MORE_N = 100_000;

export interface Side {
  name: string;
  tone: 'p1' | 'p2';
}

export interface MatchSpec<A> {
  gameId: string;
  left: Side;
  right: Side;
  /** Runs the left side won in an aggregate. */
  leftWins(agg: A): number;
  /** Runs in an aggregate. */
  runs(agg: A): number;
  /** Exact P(left side wins) from the game's exact answer; NaN when there is none. */
  leftExact(exact: unknown): number;
  /** Which side's share the target is about. */
  measure: 'left' | 'right';
  target: Target;
  /** The target's word for "on target" in the prompt, e.g. "fair". */
  onWord: string;
  noun: { one: string; many: string };
  /** Band caption on the bar; defaults to "<on label>: lo–hi%" in the left side's terms. */
  bandText?: string;
  /** A note for the sub-line once a result settles (anything but "Not enough data"); null keeps the step's own line. */
  settledNote?(a: Assessment, measured: Proportion): string | null;
}

const moreLabel = (noun: string) => `Run ${formatInt(MORE_N)} ${noun} (N)`;

/** Every sub-line the prompt can show for a target, so a step can reserve the sub-line's height up front. */
export function matchPromptVariants(target: Target, onWord: string, noun: string): string[] {
  const prop = (p: number, lo: number, hi: number, n = MATCH_N): Proportion => ({ k: 0, n, p, lo, hi, marginPP: 0 });
  const edgeLo = target.center - target.tolerance;
  const crossing = prop(edgeLo, edgeLo - 0.009, edgeLo + 0.011);
  const wide = prop(target.center, target.center - target.tolerance - 0.011, target.center + target.tolerance + 0.011);
  const settled = (['below', 'on', 'above'] as const).map((status) => {
    const c = status === 'below' ? edgeLo - 0.004 : status === 'above' ? target.center + target.tolerance + 0.004 : target.center;
    const p = prop(c, c - 0.003, c + 0.003, MORE_N);
    return resolvedLine(p, { ...assess(p, target), status, label: target.labels[status] }, noun);
  });
  return [
    `${unclearPrompt(crossing, assess(crossing, target), onWord, noun)} ${moreLabel(noun)}`,
    `${unclearPrompt(wide, assess(wide, target), onWord, noun)} ${moreLabel(noun)}`,
    ...settled,
    stillUnclearLine(onWord),
  ];
}

export class MatchPanel<A> {
  readonly el: HTMLElement;
  private readout: HTMLElement;
  private tug: ChartHost<TugData>;
  private cache = new Map<string, Promise<A>>();
  private exactCache = new Map<string, Promise<unknown>>();
  private token = 0;
  private cfg: unknown = null;
  private ghostCfg: unknown = null;
  /** The current result reads "Not enough data" at 10,000 runs, so N may run more. */
  private canRunMore = false;

  constructor(
    private ctx: AppContext,
    private spec: MatchSpec<A>,
  ) {
    this.el = el('div', { class: 'match' });
    const grid = el('div', { class: 'result-grid single' });
    this.readout = el('div', { class: 'race-readout' });
    grid.append(this.readout);
    const tugHost = el('div', { class: 'chart-host tug-host' });
    this.el.append(grid, tugHost);
    this.tug = new ChartHost(tugHost, renderTug);
  }

  reseed(): void {
    this.cache.clear();
  }

  /** Forget an unfinished result (the presenter moved on). */
  stop(): void {
    this.token++;
    this.canRunMore = false;
  }

  agg(cfg: unknown): Promise<A> {
    const k = stableStringify(cfg);
    let p = this.cache.get(k);
    if (!p) {
      p = this.ctx.runner.run<A>(this.spec.gameId, cfg, MATCH_N, this.ctx.seed);
      const pp = p;
      p.catch(() => this.cache.get(k) === pp && this.cache.delete(k));
      this.cache.set(k, p);
    }
    return p;
  }

  private exact(cfg: unknown): Promise<unknown> {
    const k = stableStringify(cfg);
    let p = this.exactCache.get(k);
    if (!p) {
      p = this.ctx.runner.exact<unknown>(this.spec.gameId, cfg);
      this.exactCache.set(k, p);
    }
    return p;
  }

  // ---- geometry: the bar is drawn in the left side's share; the target may be about either side ----

  private measured(leftK: number, n: number): Proportion {
    return wilson(this.spec.measure === 'left' ? leftK : n - leftK, n);
  }

  private toLeft(x: number): number {
    return this.spec.measure === 'left' ? x : 1 - x;
  }

  private band(): [number, number] {
    const lo = this.spec.target.center - this.spec.target.tolerance;
    const hi = this.spec.target.center + this.spec.target.tolerance;
    return this.spec.measure === 'left' ? [lo, hi] : [1 - hi, 1 - lo];
  }

  private tugData(leftK: number, n: number, exact: number, ghost: number, a?: Assessment): TugData {
    const [bandLo, bandHi] = this.band();
    const left = n > 0 ? wilson(leftK, n) : undefined;
    const m = n > 0 ? this.measured(leftK, n) : undefined;
    const crossed = m && a?.status === 'unclear' ? crossedEdge(m, a) : NaN;
    return {
      p: left?.p ?? NaN,
      lo: left?.lo ?? NaN,
      hi: left?.hi ?? NaN,
      exact,
      ghost,
      bandLo,
      bandHi,
      bandName: this.spec.target.labels.on,
      crossed: Number.isFinite(crossed) ? this.toLeft(crossed) : NaN,
      leftName: this.spec.left.name,
      rightName: this.spec.right.name,
      bandText: this.spec.bandText,
    };
  }

  /** Verdict colour: the side the result leans toward; on target is Teal; not enough data is an outline. */
  private verdictClass(status: AssessmentStatus): string {
    if (status === 'on') return 'fair';
    if (status === 'unclear') return 'unclear';
    const measuredSide = this.spec.measure === 'left' ? this.spec.left : this.spec.right;
    const otherSide = this.spec.measure === 'left' ? this.spec.right : this.spec.left;
    return `favors-${(status === 'above' ? measuredSide : otherSide).tone}`;
  }

  private row(side: Side, big: string, ci: string): string {
    return `<div class="rr-row"><span class="rr-name"><span class="swatch swatch--${side.tone}"></span>${esc(side.name)}</span><span class="rr-big">${big}</span><span class="rr-ci">${ci}</span></div>`;
  }

  // ---- rendering ----------------------------------------------------------------------------------

  /** Before anything has run: question marks where the answer will be. */
  renderPredict(): void {
    this.stop();
    this.readout.innerHTML = `
      ${this.row(this.spec.left, '?', '')}
      ${this.row(this.spec.right, '?', '')}
      <div class="rr-meta">Nothing run yet: your guess first.</div>
      <div class="verdict" style="visibility:hidden">&nbsp;</div>`;
    void this.tug.set(this.tugData(0, 0, NaN, NaN), 0);
  }

  /**
   * Show the result for `cfg`. `animate` plays the paced build-up (an explicit run); otherwise the result
   * appears at once (a tweak). `ghost`, when given, is a config whose result is marked on the bar.
   */
  async show(cfg: unknown, opts: { animate: boolean; audible: boolean; ghost?: unknown }): Promise<void> {
    const epoch = this.ctx.epoch;
    const token = ++this.token;
    const live = () => this.ctx.alive(epoch) && token === this.token;
    this.cfg = cfg;
    this.ghostCfg = opts.ghost ?? null;
    this.canRunMore = false;
    const [exact, ghost] = await Promise.all([this.exact(cfg), opts.ghost ? this.agg(opts.ghost) : Promise.resolve(undefined)]);
    if (!live()) return;

    if (opts.animate) {
      const snaps: A[] = [];
      const p = this.ctx.runner.run<A>(this.spec.gameId, cfg, MATCH_N, this.ctx.seed, (pr) => pr.checkpoint && snaps.push(pr.aggregate), {
        checkpoints: showBatches(MATCH_N),
      });
      const k = stableStringify(cfg);
      this.cache.set(k, p);
      p.catch(() => this.cache.get(k) === p && this.cache.delete(k));
      const final = await p;
      if (!live()) return;
      const frames = [...snaps, final].map((agg) => ({ n: this.spec.runs(agg), data: agg }));
      const done = await playBuildUp(this.ctx, epoch, frames, (agg, ms) => this.render(agg, exact, ghost, ms, agg === final), {
        noun: this.spec.noun,
        alive: live,
      });
      if (done) sound.verdict();
    } else {
      const agg = await this.agg(cfg);
      if (!live()) return;
      this.render(agg, exact, ghost, 300, true);
      if (opts.audible) sound.verdict();
    }
  }

  onKey(key: string): boolean {
    if (key !== 'n' || !this.canRunMore) return false;
    this.runMore().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
    return true;
  }

  /** N: 10× more runs of the same rules; the first 10,000 are the ones already on screen. */
  private async runMore(): Promise<void> {
    if (!this.canRunMore || this.cfg === null) return;
    this.canRunMore = false;
    const epoch = this.ctx.epoch;
    const token = ++this.token;
    const live = () => this.ctx.alive(epoch) && token === this.token;
    const cfg = this.cfg;
    const noun = this.spec.noun;
    const first = await this.agg(cfg);
    const m = this.measured(this.spec.leftWins(first), this.spec.runs(first));
    this.ctx.setSub(unclearPrompt(m, assess(m, this.spec.target), this.spec.onWord, noun.many), { tone: 'prompt' });
    const [exact, ghost] = await Promise.all([this.exact(cfg), this.ghostCfg ? this.agg(this.ghostCfg) : Promise.resolve(undefined)]);
    const snaps: A[] = [];
    const more = await this.ctx.runner.run<A>(this.spec.gameId, cfg, MORE_N, this.ctx.seed, (pr) => pr.checkpoint && snaps.push(pr.aggregate), {
      checkpoints: [20_000, 50_000],
    });
    if (!live()) return;
    const show = (agg: A, ms: number) => this.render(agg, exact, ghost, ms, agg === more);
    if (this.ctx.mode === 'show') {
      const frames = [first, ...snaps, more].map((agg) => ({ n: this.spec.runs(agg), data: agg }));
      const done = await playBuildUp(this.ctx, epoch, frames, show, {
        noun,
        tweenMs: 600,
        alive: live,
        label: (n) => addingLabel(n, MORE_N, noun),
      });
      if (done) sound.verdict();
    } else {
      show(more, 300);
      sound.verdict();
    }
  }

  private render(agg: A, exact: unknown, ghost: A | undefined, ms: number, final: boolean): void {
    const n = this.spec.runs(agg);
    const leftK = this.spec.leftWins(agg);
    const left = wilson(leftK, n);
    const right = wilson(n - leftK, n);
    const m = this.measured(leftK, n);
    const a = assess(m, this.spec.target);
    // Derive the right side from the rounded left so the two readouts always add up to 100.0%.
    const rightShown = Number.isFinite(left.p) ? fx(100 - Number(fx(left.p * 100))) : fx(NaN);
    const ex = exact == null ? NaN : this.spec.leftExact(exact);
    const exactTxt = Number.isFinite(ex)
      ? `<span class="exact-inline">math: ${fx(ex * 100, 2)}%</span>`
      : `<span class="exact-inline">no closed form — simulation only</span>`;
    this.readout.innerHTML = `
      ${this.row(this.spec.left, `${fx(left.p * 100)}%`, `± ${fx(left.marginPP)} pp`)}
      ${this.row(this.spec.right, `${rightShown}%`, `± ${fx(right.marginPP)} pp`)}
      <div class="rr-meta">n = ${formatInt(n)} ${esc(this.spec.noun.many)} · ${exactTxt}</div>
      <div class="verdict ${this.verdictClass(a.status)}">${esc(a.label)}</div>`;
    const ghostLeft = ghost ? this.spec.leftWins(ghost) / this.spec.runs(ghost) : NaN;
    void this.tug.set(this.tugData(leftK, n, ex, ghostLeft, a), ms);
    if (final) this.promptFor(m, a);
  }

  /** The sub-line under a final result: the "Not enough data" prompt, how the extra run ended, or the step's note. */
  private promptFor(m: Proportion, a: Assessment): void {
    const { onWord, noun } = this.spec;
    if (m.n === MORE_N) {
      this.canRunMore = false;
      if (a.status === 'unclear') this.ctx.setSub(stillUnclearLine(onWord), { tone: 'prompt' });
      else this.ctx.setSub(resolvedLine(m, a, noun.many), { tone: 'note' });
    } else if (a.status === 'unclear') {
      this.canRunMore = true;
      this.ctx.setSub(unclearPrompt(m, a, onWord, noun.many), {
        tone: 'prompt',
        action: { label: moreLabel(noun.many), run: () => void this.onKey('n') },
      });
    } else {
      this.canRunMore = false;
      const note = this.spec.settledNote?.(a, m) ?? null;
      this.ctx.setSub(note, note ? { tone: 'note' } : {});
    }
  }
}
