/** Messages between the main thread (runner.ts) and the simulation worker (worker.ts). */

export type WorkerRequest =
  | {
      type: 'run';
      id: number;
      gameId: string;
      config: unknown;
      n: number;
      seed: string;
      /** Cumulative counts at which a snapshot of the aggregate is posted. */
      checkpoints?: number[];
    }
  | { type: 'exact'; id: number; gameId: string; config: unknown };

export type WorkerResponse =
  | { type: 'progress'; id: number; done: number; total: number; aggregate: unknown; checkpoint: boolean }
  | { type: 'done'; id: number; aggregate: unknown; elapsedMs: number }
  | { type: 'exact'; id: number; exact: unknown }
  | { type: 'error'; id: number; message: string };
