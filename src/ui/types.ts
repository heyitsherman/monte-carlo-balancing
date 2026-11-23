import type { Runner } from '../core/runner';

export type Mode = 'show' | 'fast';

export interface StepDef {
  /** Large caption at the top: the presenter's script. */
  caption: string;
  /** Optional smaller line under the caption. */
  sub?: string;
  /** Every other sub-line this step can show (via `setSub`), so its height can be reserved up front. */
  subVariants?: string[];
  /** The sub-line asks the room to do something (predict, vote): marked like an activity. */
  activity?: boolean;
  /** A chapter's last step: its one-line takeaway, shown in place of the sub-line. */
  takeaway?: string;
}

/** How a sub-line set by a chapter is shown. */
export interface SubOptions {
  /** 'prompt': the room or presenter should act (Mustard bar); 'note': a conclusion (Cobalt bar). */
  tone?: 'prompt' | 'note';
  /** A button at the end of the line, e.g. "Run 100,000 games (N)". */
  action?: { label: string; run: () => void };
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
  setSub(text: string | null, opts?: SubOptions): void;
  /** Show (or with null, hide) the replay label, e.g. "Replaying the first 100 games". */
  setReplay(text: string | null): void;
}

export interface EnterInfo {
  direction: 'forward' | 'backward' | 'jump' | 'rerun';
  /** True when the step should play its Show-mode sequence. */
  animate: boolean;
}

/** One chapter of the talk: a sequence of steps sharing one stage. */
export interface Chapter {
  /** Short, stable, URL-safe id used in playlists and deep links (`?set=duel,race`, `#race.4`). */
  id: string;
  title: string;
  /** Rough presenting time, shown on the overview screen. */
  minutes: number;
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
  /** The game and rules on screen right now, for "Open in Lab" (L); null when there is nothing to open. */
  labLink?(): { game: string; config: object } | null;
}
