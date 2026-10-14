/// <reference lib="webworker" />
import { getGame } from '../games/registry';
import { runRng } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

/** Post progress at least this often (ms of work) so the UI stays live. */
const PROGRESS_MS = 50;
/** Games simulated between clock checks. */
const CHUNK = 512;

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: WorkerResponse) => ctx.postMessage(msg);

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const game = getGame(req.gameId);
    if (req.type === 'exact') {
      post({ type: 'exact', id: req.id, exact: game.exact ? game.exact(req.config) : null });
      return;
    }

    const t0 = performance.now();
    const rng = runRng(req.seed, req.gameId, req.config);
    let agg = game.emptyAggregate();
    const checkpoints = (req.checkpoints ?? []).filter((c) => c > 0 && c < req.n).sort((a, b) => a - b);
    let ci = 0;
    let done = 0;
    let lastPost = t0;

    while (done < req.n) {
      const stop = Math.min(req.n, done + CHUNK, ci < checkpoints.length ? checkpoints[ci] : req.n);
      for (; done < stop; done++) agg = game.accumulate(agg, game.simulate(req.config, rng));
      const hitCheckpoint = ci < checkpoints.length && done === checkpoints[ci];
      if (hitCheckpoint) ci++;
      const now = performance.now();
      if (done < req.n && (hitCheckpoint || now - lastPost >= PROGRESS_MS)) {
        post({ type: 'progress', id: req.id, done, total: req.n, aggregate: agg, checkpoint: hitCheckpoint });
        lastPost = now;
      }
    }
    post({ type: 'done', id: req.id, aggregate: agg, elapsedMs: performance.now() - t0 });
  } catch (err) {
    post({ type: 'error', id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
