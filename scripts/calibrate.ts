/**
 * Calibration report (prints, asserts nothing): exact P1 win rates for the race across
 * track lengths and head starts, then the measured numbers quoted in the README, including
 * the Phase 4 chapters (push your luck, loot, best-of-N, boss and handicap).
 * Run with `npm run calibrate`.
 */
import { runSync } from '../src/core/engine';
import {
  BOSS_TARGET,
  FAIR_TARGET,
  HANDICAP_TARGET,
  LOOT_TARGET,
  SKILL_TARGET,
  assess,
  formatProportion,
  histPercentile,
  meanCI,
  meanInterval,
  wilson,
} from '../src/core/stats';
import { bestOf, exactBestOf, shortestSeries, type BestOfAggregate } from '../src/games/bestOf';
import { boss, exactBoss, type BossAggregate } from '../src/games/boss';
import { exactLoot, loot, type LootAggregate } from '../src/games/loot';
import { pushLuck, turnExact, type LuckAggregate, type LuckConfig } from '../src/games/pushLuck';
import { DUEL_OUTCOMES, diceDuel, exactDuel, type DuelAggregate } from '../src/games/diceDuel';
import { exactRace, race, type RaceAggregate } from '../src/games/race';
import { playtestGroups } from '../src/ui/chapters/playtests';

// ---- race calibration table ----
{
  const base = race.defaultConfig;
  const rows: string[] = [];
  rows.push('len | baseline | hs1 | hs2 | hs3 | hs4 | bonus+1 | meanTurns');
  for (let len = 12; len <= 40; len++) {
    const e = (o: object) => exactRace({ ...base, trackLength: len, ...o });
    const pct = (x: number) => (x * 100).toFixed(2).padStart(6);
    rows.push(
      [
        String(len).padStart(3),
        pct(e({}).p1Win),
        pct(e({ p2HeadStart: 1 }).p1Win),
        pct(e({ p2HeadStart: 2 }).p1Win),
        pct(e({ p2HeadStart: 3 }).p1Win),
        pct(e({ p2HeadStart: 4 }).p1Win),
        pct(e({ p2FirstRollBonus: 1 }).p1Win),
        e({}).meanTurns.toFixed(2),
      ].join(' | '),
    );
  }
  console.log(rows.join('\n'));
}

// ---- measured numbers for the README (default seed) ----
{
  const seed = 'dgt-balance';
  const out: string[] = [];
  const duel = exactDuel(diceDuel.defaultConfig);
  for (const n of [10_000, 100_000]) {
    const agg = runSync<DuelAggregate>('diceDuel', diceDuel.defaultConfig, n, seed);
    out.push(
      `Dice Duel n=${n}: ` +
        DUEL_OUTCOMES.map((o) => `${o} ${formatProportion(wilson(agg[o], n))} (exact ${(duel[o].p * 100).toFixed(2)}%)`).join(' | '),
    );
  }
  const variants: [string, object][] = [
    ...[0, 1, 2, 3, 4, 5, 6].map((h): [string, object] => [`head start ${h}`, { p2HeadStart: h }]),
    ['first-roll bonus', { p2FirstRollBonus: 1 }],
    ['catch-up', { catchUp: true }],
  ];
  for (const [name, v] of variants) {
    const cfg = { ...race.defaultConfig, ...v };
    const agg = runSync<RaceAggregate>('race', cfg, 10_000, seed);
    const w = wilson(agg.p1Wins, agg.n);
    const e = race.exact!(cfg);
    const m = meanCI(agg.turnsSum, agg.turnsSumSq, agg.n);
    out.push(
      `Race ${name}: P1 ${formatProportion(w)} → ${assess(w, FAIR_TARGET).label}; exact ${e ? (e.p1Win * 100).toFixed(2) + '%' : 'n/a'}; ` +
        `avg length ${m.mean.toFixed(2)} ± ${m.margin.toFixed(2)} turns; ` +
        `lead changes ${(agg.leadChangesSum / agg.n).toFixed(2)}, comebacks ${((agg.comebacks / agg.n) * 100).toFixed(1)}%, ` +
        `decided early ${((agg.decidedEarly / agg.n) * 100).toFixed(1)}%`,
    );
  }
  console.log(out.join('\n'));
}

// ---- ten playtests: 20 groups × 10 games of the baseline race ----
{
  const groups = playtestGroups('dgt-balance');
  const count = (c: string) => groups.filter((g) => g.call === c).length;
  console.log(`Playtests (seed dgt-balance): P1 ahead ${count('p1')}, looks fair ${count('tie')}, P2 ahead ${count('p2')}`);
  // Exact: P1's wins in 10 games are binomial(10, p) with the exact baseline p.
  const p = exactRace(race.defaultConfig).p1Win;
  const choose = (n: number, k: number) => {
    let c = 1;
    for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
    return c;
  };
  const pk = (k: number) => choose(10, k) * p ** k * (1 - p) ** (10 - k);
  const tie = pk(5);
  let below = 0;
  for (let k = 0; k <= 4; k++) below += pk(k);
  console.log(
    `Playtests exact: P(looks fair) ${(tie * 100).toFixed(1)}%, P(P2 ahead) ${(below * 100).toFixed(1)}%, ` +
      `so ${((tie + below) * 20).toFixed(1)} of 20 groups get it wrong on average`,
  );
}

// ---- Phase 4 chapters (default seed, 10,000 runs each, as on screen) ----
{
  const seed = 'dgt-balance';
  const N = 10_000;
  const out: string[] = [];
  const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

  // Push your luck
  const luckCfg = (c: Partial<LuckConfig>) => ({ ...pushLuck.defaultConfig, ...c });
  for (const pr of pushLuck.presets!) {
    const agg = runSync<LuckAggregate>('pushLuck', luckCfg(pr.config), N, seed);
    const w = wilson(agg.aWins, agg.n);
    out.push(`Push your luck, ${pr.label}: bot A ${formatProportion(w)} → ${assess(w, FAIR_TARGET).label}`);
  }
  const holds = [5, 10, 15, 20, 25, 30, 35, 40];
  out.push(
    'Push your luck, points per turn (sim, exact): ' +
      holds
        .map((h) => {
          const agg = runSync<LuckAggregate>('pushLuck', luckCfg({ aHoldAt: h, bHoldAt: h }), N, seed);
          const m = meanCI(agg.aPtsSum, agg.aPtsSumSq, agg.aTurns);
          return `bank at ${h}: ${m.mean.toFixed(2)} ± ${m.margin.toFixed(2)} (${turnExact({ strategy: 'holdAt', holdAt: h, rolls: 1 }).perTurn.toFixed(2)})`;
        })
        .join(' | '),
  );

  // Loot
  for (const pr of loot.presets!) {
    const cfg = { ...loot.defaultConfig, ...pr.config };
    const agg = runSync<LootAggregate>('loot', cfg, N, seed);
    const m = meanCI(agg.sum, agg.sumSq, agg.n);
    const e = exactLoot(cfg);
    out.push(
      `Loot, ${pr.label}: average ${m.mean.toFixed(2)} ± ${m.margin.toFixed(2)} (exact ${e.mean.toFixed(2)}) → ${assess(meanInterval(m), LOOT_TARGET).label}; ` +
        `median ${histPercentile(agg.hist, 0.5)} (${e.median}), 1 in 10 ${histPercentile(agg.hist, 0.9)} (${e.p90}), 1 in 100 ${histPercentile(agg.hist, 0.99)} (${e.p99}), unluckiest ${agg.max}`,
    );
  }
  for (const d of [3, 4, 5, 6]) {
    const cfg = { ...loot.defaultConfig, dropPercent: d, pity: 40 };
    const agg = runSync<LootAggregate>('loot', cfg, N, seed);
    const m = meanCI(agg.sum, agg.sumSq, agg.n);
    out.push(`Loot, ${d}% with pity at 40: average ${m.mean.toFixed(2)} ± ${m.margin.toFixed(2)} (exact ${exactLoot(cfg).mean.toFixed(2)}) → ${assess(meanInterval(m), LOOT_TARGET).label}`);
  }

  // Best-of-N
  out.push(
    'Best-of-N at 55% (sim, exact): ' +
      [1, 3, 5, 7, 9, 15, 21, 31, 45, 61]
        .map((n) => {
          const agg = runSync<BestOfAggregate>('bestOf', { ...bestOf.defaultConfig, bestOf: n }, N, seed);
          const w = wilson(agg.strongerWins, agg.n);
          return `bo${n} ${pct(w.p)} ± ${w.marginPP.toFixed(1)} (${pct(exactBestOf({ ...bestOf.defaultConfig, bestOf: n }).strongerWin, 2)}) ${assess(w, SKILL_TARGET).label}`;
        })
        .join(' | '),
  );
  out.push(`Best-of-N: shortest series with 75% at a 55% edge: best-of-${shortestSeries(55, 0.75)}`);

  // Boss
  for (let b = 24; b <= 36; b++) {
    const cfg = { ...boss.defaultConfig, bossHp: b };
    const agg = runSync<BossAggregate>('boss', cfg, N, seed);
    const w = wilson(agg.heroWins, agg.n);
    out.push(
      `Boss ${b} HP: hero wins ${formatProportion(w)} (exact ${pct(exactBoss(cfg).heroWin, 2)}) → ${assess(w, BOSS_TARGET).label} / fairness: ${assess(w, FAIR_TARGET).label}; ` +
        `close wins ${pct(agg.closeWins / agg.n)}, rounds ${(agg.roundsSum / agg.n).toFixed(2)}`,
    );
  }

  // Handicap: P2's share against 58% ± 3
  for (let h = 0; h <= 6; h++) {
    const cfg = { ...race.defaultConfig, p2HeadStart: h };
    const agg = runSync<RaceAggregate>('race', cfg, N, seed);
    const w = wilson(agg.p2Wins, agg.n);
    out.push(`Handicap, head start ${h}: P2 ${formatProportion(w)} (exact ${pct(exactRace(cfg).p2Win, 2)}) → ${assess(w, HANDICAP_TARGET).label}`);
  }
  console.log(out.join('\n'));
}
