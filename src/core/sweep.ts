import { run } from './runner';

/**
 * Generic N-dimensional parameter sweep over numeric config keys.
 * Chapter 2 uses it in 1D (head start 0…6). A heatmap chapter (v2) can sweep
 * e.g. trackLength × p2HeadStart and only needs a new chart + chapter file.
 */

export interface SweepAxis {
  /** A numeric key of the game's config. */
  key: string;
  values: number[];
}

export interface SweepCell<A> {
  /** Index into each axis' `values`, in axis order. */
  index: number[];
  /** The axis values for this cell, in axis order. */
  coords: number[];
  config: Record<string, unknown>;
  aggregate: A;
}

export interface SweepResult<A> {
  axes: SweepAxis[];
  /** Row-major over axes (last axis varies fastest). */
  cells: SweepCell<A>[];
  /** Look up a cell by axis indices. */
  at(...index: number[]): SweepCell<A>;
}

export type RunFn = <A>(gameId: string, config: unknown, n: number, seed: string) => Promise<A>;

export interface SweepOptions<A> {
  /** Called as each cell completes (Show mode can reveal cells one by one). */
  onCell?: (cell: SweepCell<A>, completed: number, total: number) => void;
  /** Defaults to the shared worker runner; tests inject a synchronous one. */
  runFn?: RunFn;
}

/** Cartesian product of axis indices, last axis fastest. */
export function gridIndices(sizes: number[]): number[][] {
  let out: number[][] = [[]];
  for (const size of sizes) {
    const next: number[][] = [];
    for (const prefix of out) for (let i = 0; i < size; i++) next.push([...prefix, i]);
    out = next;
  }
  return out;
}

export async function sweep<A>(
  gameId: string,
  baseConfig: object,
  axes: SweepAxis[],
  nPerCell: number,
  seed: string,
  opts: SweepOptions<A> = {},
): Promise<SweepResult<A>> {
  const runFn: RunFn = opts.runFn ?? run;
  const sizes = axes.map((a) => a.values.length);
  const indices = gridIndices(sizes);
  const cells: SweepCell<A>[] = [];
  for (const index of indices) {
    const config: Record<string, unknown> = { ...baseConfig };
    const coords = index.map((i, d) => axes[d].values[i]);
    coords.forEach((v, d) => (config[axes[d].key] = v));
    // Each cell is seeded by (seed, config), so it equals a standalone run of that config.
    const aggregate = await runFn<A>(gameId, config, nPerCell, seed);
    const cell = { index, coords, config, aggregate };
    cells.push(cell);
    opts.onCell?.(cell, cells.length, indices.length);
  }
  const strides = sizes.map((_, d) => sizes.slice(d + 1).reduce((a, b) => a * b, 1));
  return {
    axes,
    cells,
    at: (...index: number[]) => cells[index.reduce((s, i, d) => s + i * strides[d], 0)],
  };
}
