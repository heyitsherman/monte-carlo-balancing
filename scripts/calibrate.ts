/**
 * Calibration report (prints, asserts nothing): exact P1 win rates for the race across
 * track lengths and head starts, then the measured numbers quoted in the README.
 * Run with `npm run calibrate`.
 */
import { runSync } from '../src/core/engine';
import { FAIR_TARGET, assess, formatProportion, meanCI, wilson } from '../src/core/stats';
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
