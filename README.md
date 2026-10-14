# Run it 10,000 times

A presenter-driven browser demo that explains **Monte Carlo simulation as a game-balancing tool**, built for a 5-minute slot in a game design class (game balancing lesson) and doubling as a portfolio piece and sandbox.

> Probability tells you what *should* happen. When interactions are too complex to calculate, Monte Carlo simulation tells you what *does* happen — by playing the game thousands of times. Small effects need 10,000+ runs to see. And a simulation only knows what its simulated players know: it complements playtesting, it doesn't replace it.

**Live demo:** https://heyitsherman.github.io/monte-carlo-balancing/

---

## How to present

Open the page full-screen (F11) on the projector. Everything is keyboard-driven; a presentation clicker (PageUp/PageDown) works too.

| Key | Action |
| --- | --- |
| `→` / `Space` / `PgDn` | Next step |
| `←` / `PgUp` | Previous step |
| `R` | Re-run the current step (rolls a new battle / race in the single-game steps; replays the Show-mode sequence elsewhere) |
| `F` | Toggle **Show** mode (batches 1 → 10 → 100 → 1,000 → 10,000 with pauses) / **Fast** mode (final result at once) |
| `S` | Reseed with a random seed (footer shows the seed) |
| `+` / `−` (also `↑` / `↓`) | Adjust the active slider / toggle (race chapter) |
| `1` – `4` | Jump to chapter 1 (Title), 2 (Dice Duel), 3 (First-Player Problem), 4 (Closing) |
| `T` | Toggle light / dark theme |
| `Esc` | Help overlay with these keys |

Mouse/touch: buttons in the footer (◀ ▶ R F ?), plus the slider and toggles in the race chapter.

**Deep links for rehearsal:** `#<chapter>.<step>`, both 1-based — e.g. `…/monte-carlo-balancing/#3.4` opens the head-start sweep. Without a hash, the app reopens the last chapter you were on (stored in `localStorage`).

### Run of show (≈ 5 min)

Numbers are screen.step as used by deep links and the footer (the PRD's Chapters 0–3 are screens 1–4).

| # | Caption | What happens |
| --- | --- | --- |
| 1 | Run it 10,000 times | Title + core message |
| 2.1 | *Attacker rolls 3 dice, defender rolls 2. Who wins?* | One battle with dice faces and pairwise comparisons. `R` rolls another. |
| 2.2–2.5 | *10 battles. / 100. / 1,000. / 10,000.* | Bar chart with 95% CI whiskers that visibly shrink (sub-line states the margin) |
| 2.6 | *Now the exact math.* | Exact-value markers (dashed) land inside the whiskers |
| 2.7 | *Noise becomes signal.* | Running estimate vs N (log axis, 1 → 100,000) with CI band and exact line |
| 3.1 | *A simple race…* | One animated game on the track |
| 3.2 | *Is it fair? Play it 10,000 times.* | Streams 1 → 10,000 games; verdict **Favors P1** |
| 3.3 | *Fix #1: give Player 2 a head start.* | Press `+` twice: head start 2 flips it to **Favors P2** |
| 3.4 | *Too far…* | Sweep of head start 0…6 — no whole number is fair, so the sub-line says *change the rule, not the number* |
| 3.5 | *Fix #2: +1 on P2's first roll.* | Same math as a 1-square head start (see Decisions) |
| 3.6 | *Fix #3: whoever is behind rolls 2 dice…* | Fairer, shorter games; length histogram vs baseline |
| 4 | Three things to take home | Closing |

The default seed is `dgt-balance`, so every rehearsal shows identical numbers. Pressing `S` gives fresh numbers; reload the page to return to the default seed.

## Measured numbers (seed `dgt-balance`)

Regenerate with `npm run calibrate`.

**Dice Duel** (3 attacker dice vs 2 defender dice, ties to defender). Exact values come from enumerating all 6⁵ = 7,776 rolls.

| Outcome | Exact | Simulated, n = 10,000 | Simulated, n = 100,000 |
| --- | --- | --- | --- |
| Attacker wins both | 2890/7776 = 37.17% | 37.3% ± 0.9 pp | 37.2% ± 0.3 pp |
| Split 1–1 | 2611/7776 = 33.58% | 33.2% ± 0.9 pp | 33.6% ± 0.3 pp |
| Defender wins both | 2275/7776 = 29.26% | 29.6% ± 0.9 pp | 29.2% ± 0.3 pp |

**Race calibration.** Default `trackLength = 20` (d6, no fixes): exact P1 win rate **61.89%**; simulated **61.8% ± 1.0 pp (n = 10,000) → Favors P1**. Mean game length 10.4 turns (both players' turns counted). Exact P1 rates for lengths 12–40 range from 65.3% (12) to 58.5% (40); 20 was chosen as the roundest length with an unmistakable edge.

**Head-start sweep** (n = 10,000 per point):

| P2 head start | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Simulated P1 win | 61.8% | 55.1% | 48.1% | 41.6% | 35.2% | 27.8% | 21.1% |
| Exact P1 win | 61.89% | 55.30% | 48.38% | 41.33% | 34.37% | 27.72% | 21.58% |
| Verdict | Favors P1 | Favors P1 | Favors P2 | Favors P2 | Favors P2 | Favors P2 | Favors P2 |

All margins are ±0.8–1.0 pp. The crossover falls between 1 and 2, and **no whole-number head start is fair**.

**Other fixes** (n = 10,000): P2 +1 on first roll → 55.0% ± 1.0 pp (exact 55.30%, Favors P1). Catch-up rule → 55.7% ± 1.0 pp (no closed form, Favors P1), with mean length down from 10.43 to 9.24 turns.

**Performance** (headless Chrome on the Windows 11 build machine): a 10,000-game race re-run updates the screen in ~25 ms; 100,000 dice battles plus 100+ snapshots take < 150 ms including page load. The Show-mode 1 → 10,000 sequence takes ~3.7 s for the race baseline and ~6.5 s when replaying the Dice Duel bars with `R`.

## Run locally

Requires Node 20+ (tested on Node 24, Windows 11).

```bash
npm install
npm run dev        # http://localhost:5173/monte-carlo-balancing/
npm test           # Vitest: RNG, stats, exact-vs-simulation, calibration band, maxTurns
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ under the Pages subpath
npm run calibrate  # print the calibration table and the README numbers
```

### Deploy

`.github/workflows/deploy.yml` builds, tests and deploys to GitHub Pages on every push to `main`. In the repo settings, set **Pages → Source** to **GitHub Actions**. The Vite `base` is `/monte-carlo-balancing/`, so the repository must be named `monte-carlo-balancing` (or change `base` in `vite.config.ts`).

## Architecture

```
src/
  core/
    rng.ts        seeded PRNG (sfc32, seeded via cyrb128 from string or int)
    stats.ts      proportions + Wilson 95% CI, verdicts, mean CI, histogram helpers
    engine.ts     shared simulate loop, per-run seeding, Show-mode batch/checkpoint helpers
    protocol.ts   worker message types
    worker.ts     runs batches off the main thread, posts progress (≥ every 50 ms) and checkpoint snapshots
    runner.ts     main-thread API: run(gameId, config, n, seed, onProgress, {checkpoints}) → Promise<Aggregate>
    sweep.ts      N-dimensional sweep over numeric config keys → grid of aggregates
  games/
    types.ts      Game<Config, Outcome, Aggregate, Exact> interface
    diceDuel.ts   Risk-style battle + exact enumeration
    race.ts       first-player race + exact DP (without catch-up)
    registry.ts   gameId → Game
  ui/
    presenter.ts  chapter/step state machine, keyboard, caption, footer, help
    charts/       hand-written SVG: bars + whiskers, convergence band, tug-of-war, sweep, histogram, dice
    chapters/     one file per chapter (bookends.ts holds Title and Closing)
  main.ts
tests/            Vitest suites (+ calibrate.test.ts, a report rather than assertions)
```

The RNG stream for a run is derived from `(seed, gameId, config)`. Consequences: Show and Fast modes produce identical final numbers; going back to a config reproduces its numbers exactly; and a sweep cell equals the standalone run of the same config (head start 0 in the sweep *is* the baseline).

## Adding a game

1. **Game file** — create `src/games/myGame.ts` exporting an object that implements `Game<C, O, A>` (`src/games/types.ts`):
   - `defaultConfig`: plain JSON numbers/booleans only, so any numeric key can be swept.
   - `simulate(config, rng)`: plays **one** game; must be pure given the RNG.
   - `emptyAggregate()` / `accumulate(agg, outcome)`: a cumulative, structured-cloneable aggregate (mutating and returning `agg` is fine).
   - `exact(config)` *(optional)*: a closed-form or DP answer, used as a test oracle and as overlay markers.
2. **Register it** — add one line to `src/games/registry.ts`. The worker, `runner.run('myGame', …)` and `sweep('myGame', …)` now work.
3. **Chapter file** — create `src/ui/chapters/myGame.ts` implementing `Chapter` (`src/ui/types.ts`): a `steps` list of captions, `mount()` to build DOM once, and an idempotent `enter(step, info)`. Add it to the list in `src/main.ts`.
4. **Tests** — add exact-vs-simulation checks to `tests/games.test.ts` using `runSync`.

**v2 heatmaps:** `sweep()` already takes any number of axes, e.g.

```ts
sweep('race', race.defaultConfig,
  [{ key: 'trackLength', values: [12, 16, 20, 24, 28] }, { key: 'p2HeadStart', values: [0, 1, 2, 3] }],
  10_000, seed);
```

returns a row-major grid with `.at(i, j)`. A heatmap chapter needs only a new chart in `src/ui/charts/` and a chapter file. `tests/core.test.ts` covers a 2-D sweep.

## Decisions

- **Track length 20.** Exact baseline P1 win rate 61.89% (inside the 57–65% band, ~12 CIs from 50% at n = 10,000). Round, and 21 squares fit legibly on a projector.
- **Fix #2 is mathematically identical to a 1-square head start.** Without catch-up, the players never interact, so "+1 on the first roll" just shifts every later position by 1. The exact values are equal (55.30%), and the step's sub-line says so. That is a useful lesson: different-looking rules can be the same rule. The PRD's step stays as written.
- **No integer head start is fair** (1 → 55.3%, 2 → 48.4%). The sweep step shows the PRD's conditional sub-line. Catch-up gets closer (55.7%) but still favors P1 at n = 10,000. The caption says "Fairer", not "fair", and the screen shows the true verdict.
- **Game length** counts both players' turns (P1 winning on their 5th move = 9 turns).
- **"± x pp"** is the half-width of the Wilson interval, which is slightly asymmetric; the whiskers and bands draw the true asymmetric bounds. Mean game length gets a normal-approximation 95% CI, so it also shows ± and n.
- **Dice Duel runs from one 100,000-battle stream.** Steps 10 / 100 / 1,000 / 10,000 show cumulative snapshots of the same stream, so the bars at 10,000 are the first 10,000 battles of the convergence chart.
- **Show vs Fast.** The mode is global (default Show, toggled with `F`) and applies to step entry and `R`. Slider/toggle changes in the race chapter always run Fast, per the PRD. Going backwards always renders instantly. Show-mode pacing happens on the main thread over checkpoint snapshots from the worker, so the worker never sleeps.
- **Single illustrative games** (the one battle in 2.1, the one race in 3.1) are simulated on the main thread: one game takes microseconds. All bulk simulation and `exact()` calls run in the worker.
- **Keys `1`–`4` map to the four screens in order** (Title, Dice Duel, Race, Closing). The footer numbers chapters the same way (`2/4 Dice Duel`), which avoids the PRD's 0-based chapter numbering clashing with the keys. Added extras: `PgUp`/`PgDn` (clickers), `↑`/`↓` as aliases for `+`/`−`, `T` for theme, and deep links.
- **Reseed** cancels in-flight work by terminating and recreating the worker.
- **"Games simulated"** in the footer is the session total, a nice live counter for the audience.
- **Phones:** below 760 px wide the layout scrolls and readouts shrink below the projector minimums (readable, not polished, per the PRD).
- **Fonts:** system font stack (Segoe UI on Windows), so there is no network dependency at all.
- **Tooling:** Vite 6, TypeScript 5 (strict), Vitest 3.

## Licenses

- **Code:** MIT. See [LICENSE](LICENSE).
- **Explanatory text** (captions, README prose, on-screen copy): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
