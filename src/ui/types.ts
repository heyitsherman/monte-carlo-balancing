import type { Runner } from '../core/runner';

export type Mode = 'show' | 'fast';

export interface StepDef {
  /** Large caption at the top: the presenter's script. */
  caption: string;
  /** Optional smaller line under the caption. */
  sub?: string;
}

export interface AppContext {
  readonly seed: string;
  readonly mode: Mode;
  readonly runner: Runner;
  /** Increments on every step change, re-run and reseed. Async work compares against it. */
  readonly epoch: number;
  alive(epoch: number): boolean;
  /** Sleep, then report whether `epoch` is still current. */
  wait(ms: number, epoch: number): Promise<boolean>;
  /** Override the current step's sub-line (null restores the default). */
  setSub(text: string | null): void;
}

export interface EnterInfo {
  direction: 'forward' | 'backward' | 'jump' | 'rerun';
  /** True when the step should play its Show-mode sequence. */
  animate: boolean;
}

/** One chapter of the talk: a sequence of steps sharing one stage. */
export interface Chapter {
  id: string;
  title: string;
  steps: StepDef[];
  /** Show the "± is a 95% CI" footnote while this chapter is active. */
  showsStats?: boolean;
  /** Build DOM once. */
  mount(stage: HTMLElement, ctx: AppContext): void;
  /** Render step `step` (0-based). Must be idempotent: any step can be entered from anywhere. */
  enter(step: number, info: EnterInfo): void;
  /** `+` / `-`: adjust the active slider or toggle. */
  adjust?(delta: number): void;
  /** Extra keys (lowercase). Return true if handled. */
  onKey?(key: string): boolean;
  /** Seed changed: drop cached results. */
  reseed?(): void;
}
