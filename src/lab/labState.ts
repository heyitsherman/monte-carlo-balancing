/**
 * The Lab's state and its URL. Everything a student sets lives in the query string, so a link reproduces
 * exactly what they saw (same game, rules, runs and seed, so the same numbers). Pure: no DOM, unit-tested.
 *
 * `?lab&game=race&a.p2HeadStart=2&b&b.catchUp=1&n=10000&seed=dgt-balance&view=sweep&metric=p1Win&x=p2HeadStart`
 * Only settings that differ from the game's defaults are written.
 */
import { getGame } from '../games/registry';
import type { AnyGame, ParamSpec } from '../games/types';

export type LabView = 'results' | 'sweep';
export type Config = Record<string, unknown>;

export interface LabState {
  game: string;
  /** Rule set A: a full config. */
  a: Config;
  /** Rule set B, or null when not comparing. */
  b: Config | null;
  /** Runs per rule set. */
  n: number;
  seed: string;
  view: LabView;
  /** Selected metric id. */
  metric: string;
  /** Sweep axes (setting keys); y is optional. */
  sweepX: string | null;
  sweepY: string | null;
}

/** The games in the Lab's picker, in order, with their names for people. */
export const LAB_GAMES: { id: string; name: string }[] = [
  { id: 'diceDuel', name: 'Dice Duel' },
  { id: 'race', name: 'The race (first-player problem)' },
  { id: 'pushLuck', name: 'Push your luck' },
  { id: 'loot', name: 'Loot drops and pity timers' },
  { id: 'bestOf', name: 'Best of N' },
  { id: 'boss', name: 'Boss fight' },
];

export const LAB_RUNS = [1_000, 10_000, 100_000] as const;
export const DEFAULT_RUNS = 10_000;
/** Most runs one "run 10× more" can reach. */
export const MAX_RUNS = 1_000_000;
export const DEFAULT_LAB_SEED = 'dgt-balance';

/** Metrics that can be swept and drawn as a dot: proportions and means. */
export const sweepableMetrics = (g: AnyGame) => g.metrics.filter((m) => m.kind !== 'distribution');

export function defaultState(gameId = 'race'): LabState {
  const g = getGame(gameId);
  return {
    game: g.id,
    a: { ...g.defaultConfig },
    b: null,
    n: DEFAULT_RUNS,
    seed: DEFAULT_LAB_SEED,
    view: 'results',
    metric: g.metrics[0].id,
    sweepX: firstSweepable(g),
    sweepY: null,
  };
}

const firstSweepable = (g: AnyGame) => g.params.find((p) => p.kind === 'int')?.key ?? g.params[0]?.key ?? null;

/** A value for a setting, made valid: ints clamped to the range and snapped to the step. */
export function validValue(p: ParamSpec, raw: unknown, fallback: unknown): unknown {
  if (p.kind === 'int') {
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(v)) return fallback;
    const step = p.step ?? 1;
    const snapped = p.min + Math.round((v - p.min) / step) * step;
    return Math.min(p.max, Math.max(p.min, snapped));
  }
  if (p.kind === 'toggle') {
    if (typeof raw === 'boolean') return raw;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return fallback;
  }
  return p.options.some((o) => o.value === raw) ? raw : fallback;
}

/** Is setting `p` relevant under `config` (its `when` condition holds)? */
export const isRelevant = (p: ParamSpec, config: Config) => !p.when || config[p.when.key] === p.when.equals;

/** The settings in which `b` differs from `a`. */
export function differences(g: AnyGame, a: Config, b: Config): ParamSpec[] {
  return g.params.filter((p) => a[p.key] !== b[p.key]);
}

/** The values a sweep visits for a setting: every int (at most ~13, evenly spread), both toggle states, every choice. */
export function sweepValues(p: ParamSpec, maxPoints = 13): (number | boolean | string)[] {
  if (p.kind === 'toggle') return [false, true];
  if (p.kind === 'choice') return p.options.map((o) => o.value);
  const step = p.step ?? 1;
  const count = Math.floor((p.max - p.min) / step) + 1;
  if (count <= maxPoints) return Array.from({ length: count }, (_, i) => p.min + i * step);
  const out = new Set<number>();
  for (let i = 0; i < maxPoints; i++) out.add(p.min + Math.round((i * (count - 1)) / (maxPoints - 1)) * step);
  return [...out];
}

/** How a setting's value reads in a label: "On" / "Off", a choice's label, or the number. */
export function valueLabel(p: ParamSpec, v: unknown): string {
  if (p.kind === 'toggle') return v ? 'On' : 'Off';
  if (p.kind === 'choice') return p.options.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
}

const enc = (v: unknown) => (typeof v === 'boolean' ? (v ? '1' : '0') : String(v));

/** The query string for a state (without the leading "?"). */
export function encodeLab(s: LabState): string {
  const g = getGame(s.game);
  const def = defaultState(s.game);
  const q = new URLSearchParams();
  q.set('lab', '');
  q.set('game', s.game);
  for (const p of g.params) if (s.a[p.key] !== g.defaultConfig[p.key]) q.set(`a.${p.key}`, enc(s.a[p.key]));
  if (s.b) {
    q.set('b', '');
    for (const p of g.params) if (s.b[p.key] !== s.a[p.key]) q.set(`b.${p.key}`, enc(s.b[p.key]));
  }
  if (s.n !== DEFAULT_RUNS) q.set('n', String(s.n));
  if (s.seed !== DEFAULT_LAB_SEED) q.set('seed', s.seed);
  if (s.view !== 'results') q.set('view', s.view);
  if (s.metric !== def.metric) q.set('metric', s.metric);
  if (s.sweepX && s.sweepX !== def.sweepX) q.set('x', s.sweepX);
  if (s.sweepY) q.set('y', s.sweepY);
  // "lab=" reads better as plain "lab"
  return q.toString().replace(/^lab=/, 'lab').replace(/&b=(&|$)/, '&b$1');
}

/** A state from a query string; anything missing or invalid falls back to the defaults. */
export function decodeLab(search: string): LabState {
  const q = new URLSearchParams(search);
  const gameId = LAB_GAMES.some((x) => x.id === q.get('game')) ? q.get('game')! : 'race';
  const g = getGame(gameId);
  const s = defaultState(gameId);
  for (const p of g.params) {
    const raw = q.get(`a.${p.key}`);
    if (raw !== null) s.a[p.key] = validValue(p, p.kind === 'int' ? Number(raw) : raw, s.a[p.key]);
  }
  if (q.has('b')) {
    const b: Config = { ...s.a };
    for (const p of g.params) {
      const raw = q.get(`b.${p.key}`);
      if (raw !== null) b[p.key] = validValue(p, p.kind === 'int' ? Number(raw) : raw, b[p.key]);
    }
    s.b = b;
  }
  const n = Number(q.get('n'));
  if (Number.isInteger(n) && n >= 100 && n <= MAX_RUNS) s.n = n;
  const seed = q.get('seed');
  if (seed && /^[\w-]{1,40}$/.test(seed)) s.seed = seed;
  if (q.get('view') === 'sweep') s.view = 'sweep';
  const metric = q.get('metric');
  if (metric && g.metrics.some((m) => m.id === metric)) s.metric = metric;
  const keys = new Set(g.params.map((p) => p.key));
  const x = q.get('x');
  if (x && keys.has(x)) s.sweepX = x;
  const y = q.get('y');
  if (y && keys.has(y) && y !== s.sweepX) s.sweepY = y;
  return s;
}

/** The Lab link for a game and config (used by "Open in Lab" in the talk). */
export function labUrl(base: string, gameId: string, config: Config, seed = DEFAULT_LAB_SEED): string {
  const s = defaultState(gameId);
  const g = getGame(gameId);
  for (const p of g.params) if (p.key in config) s.a[p.key] = validValue(p, config[p.key], s.a[p.key]);
  s.seed = seed;
  return `${base}?${encodeLab(s)}`;
}
