/**
 * Speed check for the simulation engine. Run with `npm run bench`.
 *
 * Kept out of `npm test` on purpose: wall-clock limits are flaky on shared CI runners,
 * and a slow runner should never block a deploy. Throws (exit code 1) when a budget is
 * exceeded, so it is still useful locally.
 */
import { runSync } from '../src/core/engine';
import { diceDuel } from '../src/games/diceDuel';
import { race } from '../src/games/race';
import { pushLuck } from '../src/games/pushLuck';
import { loot } from '../src/games/loot';
import { bestOf } from '../src/games/bestOf';
import { boss } from '../src/games/boss';

const SEED = 'dgt-balance';
const cases: { name: string; budgetMs: number; run: () => unknown }[] = [
  { name: '100,000 Dice Duel battles', budgetMs: 300, run: () => runSync('diceDuel', diceDuel.defaultConfig, 100_000, SEED) },
  { name: '10,000 race games', budgetMs: 300, run: () => runSync('race', race.defaultConfig, 10_000, SEED) },
  { name: '10,000 push-your-luck games', budgetMs: 300, run: () => runSync('pushLuck', pushLuck.defaultConfig, 10_000, SEED) },
  { name: '10,000 loot players (4%, no pity)', budgetMs: 300, run: () => runSync('loot', { ...loot.defaultConfig, dropPercent: 4 }, 10_000, SEED) },
  { name: '10,000 best-of-61 series', budgetMs: 300, run: () => runSync('bestOf', { ...bestOf.defaultConfig, bestOf: 61 }, 10_000, SEED) },
  { name: '10,000 boss fights', budgetMs: 300, run: () => runSync('boss', boss.defaultConfig, 10_000, SEED) },
  { name: '100,000 boss fights (N)', budgetMs: 1000, run: () => runSync('boss', boss.defaultConfig, 100_000, SEED) },
];

let failed = 0;
for (const c of cases) {
  c.run(); // warm up the JIT
  const t0 = performance.now();
  c.run();
  const ms = performance.now() - t0;
  const ok = ms < c.budgetMs;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'SLOW'} ${c.name}: ${ms.toFixed(1)} ms (budget ${c.budgetMs} ms)`);
}
if (failed) throw new Error(`${failed} benchmark(s) over budget`);
