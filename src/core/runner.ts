import type { WorkerRequest, WorkerResponse } from './protocol';

export interface Progress<A> {
  done: number;
  total: number;
  /** Cumulative aggregate after `done` games. */
  aggregate: A;
  /** True when `done` is one of the requested checkpoints. */
  checkpoint: boolean;
}

export interface RunOptions {
  /** Cumulative counts at which to receive a snapshot (e.g. 1, 10, 100, ...). */
  checkpoints?: number[];
}

export class CancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'CancelledError';
  }
}

export const isCancelled = (e: unknown): boolean => e instanceof CancelledError;

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: Progress<unknown>) => void;
  n: number;
}

/**
 * Main-thread API over the simulation worker. The main thread never simulates in bulk;
 * it only receives aggregates and renders them.
 */
export class Runner {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  /** Total games simulated this session (shown in the footer). */
  totalSimulated = 0;
  onSimulated?: (total: number) => void;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => this.handle(e.data);
    w.onerror = (e) => {
      const err = new Error(e.message || 'Worker error');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    this.worker = w;
    return w;
  }

  private handle(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return; // stale (cancelled)
    switch (msg.type) {
      case 'progress':
        p.onProgress?.({ done: msg.done, total: msg.total, aggregate: msg.aggregate, checkpoint: msg.checkpoint });
        break;
      case 'done':
        this.pending.delete(msg.id);
        this.totalSimulated += p.n;
        this.onSimulated?.(this.totalSimulated);
        p.resolve(msg.aggregate);
        break;
      case 'exact':
        this.pending.delete(msg.id);
        p.resolve(msg.exact);
        break;
      case 'error':
        this.pending.delete(msg.id);
        p.reject(new Error(msg.message));
        break;
    }
  }

  private send<T>(req: WorkerRequest, n: number, onProgress?: (p: Progress<unknown>) => void): Promise<T> {
    const worker = this.ensureWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve: resolve as (v: unknown) => void, reject, onProgress, n });
      worker.postMessage(req);
    });
  }

  /** Simulate `n` games of `gameId` with `config`. Same (seed, config) → identical aggregate. */
  run<A>(
    gameId: string,
    config: unknown,
    n: number,
    seed: string,
    onProgress?: (p: Progress<A>) => void,
    opts: RunOptions = {},
  ): Promise<A> {
    const id = this.nextId++;
    return this.send<A>(
      { type: 'run', id, gameId, config, n, seed, checkpoints: opts.checkpoints },
      n,
      onProgress as ((p: Progress<unknown>) => void) | undefined,
    );
  }

  /** Closed-form / DP answer for a config, computed off the main thread. */
  exact<E>(gameId: string, config: unknown): Promise<E> {
    const id = this.nextId++;
    return this.send<E>({ type: 'exact', id, gameId, config }, 0);
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** Abort everything in flight (e.g. the presenter moved on). Pending promises reject with CancelledError. */
  cancelAll(): void {
    if (this.pending.size === 0) return;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new CancelledError());
    this.pending.clear();
  }
}

/** The app's shared runner. */
export const runner = new Runner();

/** Convenience wrapper matching the PRD signature: run(gameId, config, n, seed, onProgress). */
export function run<A>(
  gameId: string,
  config: unknown,
  n: number,
  seed: string,
  onProgress?: (p: Progress<A>) => void,
  opts?: RunOptions,
): Promise<A> {
  return runner.run<A>(gameId, config, n, seed, onProgress, opts);
}
