/**
 * Calibration report (not an assertion suite): prints exact P1 win rates for the race
 * across track lengths and head starts. Run with `npm run calibrate`.
 */
import { test } from 'vitest';
import { runSync } from '../src/core/engine';
import { formatProportion, meanCI, verdict, wilson } from '../src/core/stats';
import { DUEL_OUTCOMES, diceDuel, exactDuel, type DuelAggregate } from '../src/games/diceDuel';
import { exactRace, race, type RaceAggregate } from '../src/games/race';

test('race calibration table', () => {
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
});

test('measured numbers for the README (default seed)', () => {
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
      `Race ${name}: P1 ${formatProportion(w)} → ${verdict(w)}; exact ${e ? (e.p1Win * 100).toFixed(2) + '%' : 'n/a'}; ` +
        `avg length ${m.mean.toFixed(2)} ± ${m.margin.toFixed(2)} turns`,
    );
  }
  console.log(out.join('\n'));
});
