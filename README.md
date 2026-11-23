# Run it 10,000 times

A presenter-driven browser demo that explains **Monte Carlo simulation as a game-balancing tool**, built for a 5-minute slot in a game design class (game balancing lesson) and doubling as a portfolio piece and sandbox.

> Probability tells you what *should* happen. When interactions are too complex to calculate, Monte Carlo simulation tells you what *does* happen — by playing the game thousands of times. Small effects need 10,000+ runs to see. And a simulation only knows what its simulated players know: it complements playtesting, it doesn't replace it.

**Live demo:** https://heyitsherman.github.io/monte-carlo-balancing/ · **Offline copy:** [offline.html](https://heyitsherman.github.io/monte-carlo-balancing/offline.html), one file that runs from a USB stick with no network (also linked from the `Esc` help).

**Roadmap:** [docs/PLAN.md](docs/PLAN.md) — turning the talk into a modular teaching kit.

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
| `+` / `−` (also `↑` / `↓`) | Adjust the active slider / toggle (the race fixes, the loot drop chance, the series length, the boss's HP, the handicap) |
| `N` | When a verdict reads "Not enough data: run more": run 100,000 more of the same rules (games, fights or series; also a button in the sub-line) |
| `1` – `9` | Jump to that chapter of the session (default talk: 1 Title, 2 Dice Duel, 3 First-Player Problem, 4 Closing) |
| `O` | Overview: every chapter and step of the session; click a step to jump there |
| `M` | Sound on / off (remembered on this device) |
| `T` | Toggle light / dark theme |
| `Esc` | Help overlay with these keys (any key or click closes it) |

Mouse/touch: the buttons in the header band, top right (previous, next, re-run, Fast mode, overview, sound, theme, keys), plus the sliders and switches on the steps that have them. Hover a button to see its key.

**Sound** is on by default: dice, a blip when a run starts, a tick per batch, and a chime when a result lands. Browsers only allow audio after the first key press or click, so the opening slide is silent. `M` mutes; the choice is remembered per device, so a room of student laptops can be muted once.

**Sessions:** pick chapters and their order with `?set=`, e.g. `…/monte-carlo-balancing/?set=duel,race` for just the two simulations. Chapter ids: `title`, `duel`, `race`, `playtests`, `luck`, `loot`, `bestof`, `unfair`, `closing`. Without `?set=` you get the default talk (title, duel, race, closing; about 5½ minutes). The other chapters are in the library but not the default:

| Id | Chapter | About | Design fundamental |
| --- | --- | --- | --- |
| `playtests` | Ten Playtests Prove Nothing | 1½ min | Why playtests can't measure odds |
| `luck` | Push Your Luck | 2 min | Dominant strategies and decisions |
| `loot` | Loot Drops and Pity Timers | 2 min | How randomness feels; the worst-case player |
| `bestof` | Best of N | 1¾ min | Skill versus luck; match format |
| `unfair` | Fair Isn’t the Goal | 2½ min | Intentional unfairness: tuning toward a target that isn't 50% |

Every chapter stands on its own, so any order works. The whole library is about 15 minutes: `?set=title,duel,race,playtests,luck,loot,bestof,unfair,closing`. The overview (`O`) shows the session's link and the chapters it leaves out.

**Deep links for rehearsal:** `#<chapter>.<step>` with a chapter id or a position in the session, step 1-based — e.g. `#race.5` or `#3.5` opens the head-start sweep. Without a hash, the session opens on its first chapter.

### Run of show (about 5½ min)

Numbers are chapter.step, as used by deep links and shown in the header band. Sub-lines with a Mustard bar ask the room to do something; a Cobalt bar marks a conclusion, and each chapter's last step ends on its takeaway.

| # | Caption | What happens |
| --- | --- | --- |
| 1 | Run it 10,000 times | Title + core message |
| 2.1 | *Attacker rolls 3 dice, defender rolls 2. Who wins?* | One battle with dice faces and pairwise comparisons. `R` rolls another. |
| 2.2 | *Predict: which outcome is most likely?* | The three outcomes with question marks: take a show of hands |
| 2.3–2.6 | *10 battles. / 100. / 1,000. / 10,000.* | Bar chart with 95% CI whiskers that visibly shrink (sub-line states the margin) |
| 2.7 | *Now the exact math.* | Exact-value markers (dashed) fade in, then the axis zooms in and the bars become dots, so you can see each exact line fall inside its whisker |
| 2.8 | *Noise becomes signal.* | Running estimate vs N (log axis, 1 → 100,000) with CI band and exact line. Takeaway: when the math is too ugly to do, run the simulation |
| 3.1 | *A simple race…* | One animated game on the track; when it ends, the sub-line adds: *fair means fair across many games, not within one* |
| 3.2 | *Predict: how often does Player 1 win?* | The result screen with question marks: everyone commits to a number |
| 3.3 | *Is it fair? Play it 10,000 times.* | Streams 1 → 10,000 games: 61.8%, **Favors P1** (the fair band, 47–53%, is shaded on the bar) |
| 3.4 | *Fix #1: give Player 2 a head start.* | Press `+`: head start 1 still **Favors P1**, head start 2 reads **Fair**, 3 overshoots to **Favors P2** |
| 3.5 | *Too far…* | Sweep of head start 0…6 against the fair band: head start 2 lands inside it. *Next: two other ways to get there* |
| 3.6 | *Fix #2: +1 on P2's first roll.* | Same math as a 1-square head start (see Decisions) |
| 3.7 | *Fix #3: whoever is behind rolls 2 dice…* | Still **Favors P1**, but it plays differently: a "How it plays" table against the baseline. Takeaway: every fix changes how the game feels |
| 4 | Five things to take home | Closing |

**"Ten Playtests Prove Nothing"** (`playtests`, optional): 20 groups each play 10 games of the baseline race, shown as cards (one dot per game), then each group's naive conclusion (more wins = "has the edge", 5–5 = "looks fair"), then the truth from 10,000 games. The groups' games are the first 200 games of the race's own 10,000. Takeaway: ten playtests tell you how a game feels, not what its odds are.

### The library chapters

Each table lists the steps; numbers are from the default seed.

**Push Your Luck** (`luck`). An original Pig-style game: roll a d6 as often as you like, a 1 wipes the turn, bank to keep it, first to 100 wins. The bots ignore the score and a coin decides who starts, so only their plans are compared.

| # | Caption | What happens |
| --- | --- | --- |
| 1 | *Push your luck: roll as often as you dare.* | One turn, roll by roll (the greedy bot; `R` alternates with the careful one). A bust leaves the lost points struck through |
| 2 | *Predict: a careful bot or a greedy one?* | Careful banks at 10, greedy at 30. Question marks on the result screen |
| 3 | *Careful against greedy, 10,000 games.* | 51.9%: **Fair**. The naive test says both styles work |
| 4 | *A third bot banks at 20. Who wins now?* | Three matches appear one by one: smart beats careful 66.0% and greedy 63.8% |
| 5 | *Where should you bank? Try every threshold.* | Points per turn for banking at 5…40, simulated with exact markers: banking at 20 scores the most (8.16; exact 8.14). Takeaway: if one plan always wins, the choice is gone |

**Loot Drops and Pity Timers** (`loot`). One simulated "game" is one player farming a 5% drop. Target: an average of 20 tries ± 1.

| # | Caption | What happens |
| --- | --- | --- |
| 1 | *A rare sword drops 5% of the time. How long until you get it?* | Predict the unluckiest 1 in 100 |
| 2 | *10,000 players farm for the sword.* | Average 19.6 (**On target**), half by 14 tries, but 1 in 100 needs 89+ and the unluckiest 168. The chart shows every player's wait |
| 3 | *Fix: a pity timer. The sword is guaranteed on try 40.* | Nobody waits past 40, but the average falls to 17.2: **Too generous**. The 5% curve stays as an outline; the spike at try 40 is cut at the top of the axis and its height written beside it |
| 4 | *Now lower the drop chance (−) until the average is 20 again.* | Press `−` once: 4% with pity at 40 averages 20.2, **On target**. Takeaway: players feel the worst case, not the average |

**Best of N** (`bestof`). The stronger player wins 55% of single games. Target: they win at least 75% of series.

| # | Caption | What happens |
| --- | --- | --- |
| 1 | *Predict: win 55% of games. How often do you win a best-of-7?* | Question marks |
| 2 | *Play 10,000 best-of-7 series.* | 60.7% (exact 60.83%): **Too much luck**. `+` / `−` change the length by 2 |
| 3 | *How long must the series be for skill to win 3 times in 4?* | Sweep of best-of 1…61 against the 75% band: best-of-45 is the shortest that reaches it (exact 75.06%). Takeaway: small edges drown in luck; a short series is a choice for drama |

Best-of-45 sits right on the 75% edge, so at 10,000 series it always reads "Not enough data", and pressing `N` ends on "Still too close to call": the true value is 75.06%, and no number of runs moves it off the edge. That is a talking point, not a fault.

**Fair Isn’t the Goal** (`unfair`). A boss fight: you have 30 HP, each round you hit for a d6, then the boss (if standing) hits back for a d6.

| # | Caption | What happens |
| --- | --- | --- |
| 1 | *A boss fight. Should it be fair?* | One fight, round by round, with HP bars. `R` fights again |
| 2 | *Fair: the boss beats half the players.* | Boss at 32 HP: you win 48.5% (exact 48.69%), **Fair**. Ask the room whether they would ship that |
| 3 | *Target: 70% of players win on their first try.* | Same fight, now against 70% ± 3: **Too hard**. Press `−` four times: 28 HP gives 70.4%, **On target**. The fair boss stays on the bar as the baseline |
| 4 | *A handicap: P2 is the newer player. Aim for P2 winning 58%.* | The race again, target P2 at 58% ± 3. Press `+` three times: head start 3 gives P2 58.4% (exact 58.67%), **On target**, the head start that was "too far" for fairness |
| 5 | *Other games aim away from 50% on purpose.* | Three discussion cards: house edge, roguelike runs, snowballing. Takeaway: pick the target first, then tune toward it |

**If a verdict reads "Not enough data: run more"** (after `S`, head start 2 does this about 1 time in 5): the sub-line says which edge of the fair band the range crosses, and that edge is drawn solid on the bar. Press `N` and narrate the range shrinking as 100,000 games are added; the sub-line then states the settled verdict.

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
| Verdict (fair = 50% ± 3) | Favors P1 | Favors P1 | Fair | Favors P2 | Favors P2 | Favors P2 | Favors P2 |

All margins are ±0.8–1.0 pp. Head start 2 is fair in truth (48.38%) and its range, 47.1–49.1%, sits inside the band. How often it reads "Not enough data" instead, from the exact odds: 21% of seeds at 10,000 games, 2.6% at 20,000, effectively never at 100,000.

**Other fixes** (n = 10,000): P2 +1 on first roll → 55.0% ± 1.0 pp (exact 55.30%, Favors P1). Catch-up rule → 55.7% ± 1.0 pp (no closed form, Favors P1).

**How it plays** (n = 10,000, simulation only). The leader is read at the start, after every full round and at the finish; halfway is the middle round.

| | Baseline | Catch-up |
| --- | --- | --- |
| Average game length | 10.43 turns | 9.24 turns |
| Lead changes per game | 0.68 | 0.82 |
| Comebacks: winner was behind at halfway | 24.1% | 35.9% |
| Decided early: winner led from halfway on | 59.0% | 43.7% |

**Ten playtests** (default seed): 14 groups say P1 is ahead, 6 see a 5–5 split and call it fair, none says P2 is ahead, so **6 of 20** draw the wrong conclusion. Exact expectation: a group sees 5–5 with probability 18.4% and P2 ahead with 13.6%, so 6.4 of 20 groups get it wrong on average.

**Library chapters** (n = 10,000 each, default seed; exact in brackets):

| Chapter | Setting | Result | Verdict |
| --- | --- | --- | --- |
| Push your luck | Careful (bank at 10) vs greedy (30) | careful wins 51.9% ± 1.0 | Fair |
| | Smart (20) vs careful / vs greedy | 66.0% / 63.8% | Smart wins more |
| | Three rolls vs smart | three rolls wins 34.7% | |
| | Points per turn, bank at 5 / 10 / 15 / 20 / 25 / 30 / 35 / 40 | 4.82 / 6.91 / 7.78 / **8.16** / 8.01 / 7.60 / 6.96 / 6.34 (4.82 / 6.87 / 7.85 / **8.14** / 8.00 / 7.58 / 7.00 / 6.35) | |
| Loot | 5%, no pity | average 19.60 ± 0.37 (20.00); half by 14 (14); 1 in 100 needs 89+ (90+); unluckiest 168 | On target |
| | 5%, pity at 40 | average 17.20 ± 0.25 (17.43); nobody past 40 | Too generous |
| | 4%, pity at 40 | average 20.17 ± 0.27 (20.12); nobody past 40 | On target |
| | 4%, no pity | average 25.41 (25.00); 1 in 100 needs 115+ (113+) | Too stingy |
| Best of N | best-of 1 / 3 / 5 / 7 / 9 / 15 / 21 / 31 / 45 / 61 | 54.5 / 57.6 / 59.4 / 60.7 / 61.9 / 65.5 / 68.0 / 70.9 / 74.9 / 78.3% (55.00 / 57.48 / 59.31 / 60.83 / 62.14 / 65.35 / 67.90 / 71.32 / 75.06 / 78.41%) | Too much luck up to 31; best-of-45 not enough data; 61 skill wins |
| Boss | 24 / 26 / 27 / **28** / 29 / 30 / 32 / 36 HP | 87.4 / 79.7 / 75.1 / **70.4** / 65.8 / 59.6 / 48.5 / 28.6% (87.42 / 79.84 / 75.33 / **70.42** / 65.20 / 59.76 / 48.69 / 28.50%) | 28 HP on target; 32 HP fair |
| Handicap | head start 0 / 1 / 2 / **3** / 4 | P2 38.2 / 44.9 / 51.9 / **58.4** / 64.8% (38.11 / 44.70 / 51.62 / **58.67** / 65.63%) | 3 on target |

Every game also has **presets** for the Lab (Phase 5), each with a one-line lesson; `tests/moreGames.test.ts` checks that each one moves the numbers the way its line says.

**Performance** (headless Chrome on the Windows 11 build machine): a 10,000-game race re-run updates the screen in ~25 ms; 100,000 dice battles plus 100+ snapshots take < 150 ms including page load. The Show-mode 1 → 10,000 sequence takes ~3.7 s for the race baseline and ~6.5 s when replaying the Dice Duel bars with `R`.

## Run locally

Requires Node 20+ (tested on Node 24, Windows 11).

```bash
npm install
npm run dev        # http://localhost:5173/monte-carlo-balancing/
npm test           # Vitest: RNG, stats, exact-vs-simulation, calibration band, maxTurns
npm run build      # type-check + production build into dist/
npm run build:single  # one self-contained file, dist/offline.html (run after build)
npm run preview    # serve dist/ under the Pages subpath
npm run calibrate  # print the calibration table and the README numbers
npm run bench      # speed check against time budgets (kept out of CI: timing is flaky on shared runners)
```

### Deploy

`.github/workflows/deploy.yml` builds, tests and deploys to GitHub Pages on every push to `main`, with `offline.html` published beside the site. In the repo settings, set **Pages → Source** to **GitHub Actions**. The Vite `base` is `/monte-carlo-balancing/`, so the repository must be named `monte-carlo-balancing` (or change `base` in `vite.config.ts`).

## Architecture

```
src/
  core/
    rng.ts        seeded PRNG (sfc32, seeded via cyrb128 from string or int)
    stats.ts      proportions + Wilson 95% CI, target bands (assess, FAIR_TARGET), mean CI, histogram helpers
    metrics.ts    turns a game's metric descriptions into estimates with CIs (charts and the Lab use these)
    engine.ts     shared simulate loop, per-run seeding, Show-mode batch/checkpoint helpers
    protocol.ts   worker message types
    worker.ts     runs batches off the main thread, posts progress (≥ every 50 ms) and checkpoint snapshots
    runner.ts     main-thread API: run(gameId, config, n, seed, onProgress, {checkpoints}) → Promise<Aggregate>
    sweep.ts      N-dimensional sweep over config keys (numbers, toggles, strategy choices) → grid of aggregates
  games/
    types.ts      Game<Config, Outcome, Aggregate, Exact> interface, with setting and metric descriptions
    diceDuel.ts   Risk-style battle + exact enumeration
    race.ts       first-player race + exact DP (without catch-up)
    pushLuck.ts   Pig-style push your luck for two bots + exact points per turn
    loot.ts       tries until a drop, with an optional pity timer + exact distribution
    bestOf.ts     best-of-N series + exact binomial answer
    boss.ts       boss fight + exact DP over HP states
    registry.ts   gameId → Game
  hih/            design-system files generated from the heyitsherman-web skill (never edit; see Design system)
  fonts/          the four OFL fonts (Fontsource WOFF2) and their licences
  fonts.css       @font-face rules for them
  styles.css      app styles on the design-system tokens
  ui/
    presenter.ts  chapter/step state machine, keyboard, header band, caption, footer, help, overview
    icons.ts      the mark and the header-band icons
    layout.ts     layout stability: reserved heights and the ?layout-check observer
    playlist.ts   ?set= sessions and #id.step deep links (pure, unit-tested)
    buildUp.ts    the one animation rule: paced 1 → 10 → … → N replays, labelled as replays
    targetNotes.ts the words of the "Not enough data" prompt, from the real numbers (pure, unit-tested)
    match.ts      one side against another: readout, tug-of-war, verdict and the N flow (shared by the library chapters)
    audio.ts      synthesised sounds (Web Audio, no files) and the remembered mute setting
    charts/       hand-written SVG: bars + whiskers, convergence band, tug-of-war and sweep (both shade the target band), dot sweep for any
                  estimate, wait chart (tries per player), dice; histogram is kept for the Lab
    chapters/     one file per chapter (bookends.ts holds Title and Closing; playtests, luck, loot, bestOf, unfair are the library chapters)
  main.ts
tests/            Vitest suites (assertions only)
scripts/          calibrate.ts (README numbers) and benchmark.ts, run with vite-node
```

The RNG stream for a run is derived from `(seed, gameId, config)`. Consequences: Show and Fast modes produce identical final numbers; going back to a config reproduces its numbers exactly; and a sweep cell equals the standalone run of the same config (head start 0 in the sweep *is* the baseline).

## Adding a game

1. **Game file** — create `src/games/myGame.ts` exporting an object that implements `Game<C, O, A>` (`src/games/types.ts`):
   - `defaultConfig`: plain JSON values only (numbers, booleans, strings), so any key can be swept.
   - `params`: one description per setting a person may change (`int` with min/max/step/unit, `toggle`, or `choice`), with a plain-words label and help line. Leave internal settings (safety caps) out. A test checks every description against `defaultConfig`.
   - `metrics`: what to read from an aggregate (`proportion`, `mean` or `distribution`), with an optional `exact` reader and, for proportions, an optional design `target` (e.g. `FAIR_TARGET`, 50% ± 3).
   - **Bot strategies** are settings too: a `choice` param naming the strategy plus `int` params for its knobs, read by `simulate`. They stay reproducible and can be swept.
   - `simulate(config, rng)`: plays **one** game; must be pure given the RNG.
   - `emptyAggregate()` / `accumulate(agg, outcome)`: a cumulative, structured-cloneable aggregate (mutating and returning `agg` is fine).
   - `exact(config)` *(optional)*: a closed-form or DP answer, used as a test oracle and as overlay markers.
   - `presets` *(optional)*: rule sets for the Lab, each with a one-line lesson that a test must confirm.
2. **Register it** — add one line to `src/games/registry.ts`. The worker, `runner.run('myGame', …)` and `sweep('myGame', …)` now work.
3. **Chapter file** — create `src/ui/chapters/myGame.ts` implementing `Chapter` (`src/ui/types.ts`): a short URL-safe `id`, rough `minutes`, a `steps` list of captions, `mount()` to build DOM once, and an idempotent `enter(step, info)`. Make it self-contained: its first step should set the scene without relying on another chapter. Play build-ups with `playBuildUp` (`src/ui/buildUp.ts`) so every chapter follows the same animation rule. Add it to the `library` in `src/main.ts` (and to `defaultSet` if it belongs in the default talk).
4. **Tests** — add exact-vs-simulation checks using `runSync` (`tests/games.test.ts`, `tests/moreGames.test.ts`), plus one test per preset that checks its lesson.

**v2 heatmaps:** `sweep()` already takes any number of axes, e.g.

```ts
sweep('race', race.defaultConfig,
  [{ key: 'trackLength', values: [12, 16, 20, 24, 28] }, { key: 'p2HeadStart', values: [0, 1, 2, 3] }],
  10_000, seed);
```

returns a row-major grid with `.at(i, j)`. A heatmap chapter needs only a new chart in `src/ui/charts/` and a chapter file. `tests/core.test.ts` covers a 2-D sweep.

## Decisions

- **Track length 20.** Exact baseline P1 win rate 61.89% (inside the 57–65% band, ~12 CIs from 50% at n = 10,000). Round, and 21 squares fit legibly on a projector.
- **Fix #2 is mathematically identical to a 1-square head start.** Without catch-up, the players never interact, so "+1 on the first roll" just shifts every later position by 1. The exact values are equal (55.30%), and the step's sub-line says so. That is a useful lesson: different-looking rules can be the same rule, so the step stays in.
- **Fair means 50% ± 3** (plan D13). Under ± 2, head start 2 (48.38%, fair in truth) read "Not enough data" even at 200,000 games, which made the storyline murky. Under ± 3 it reads Fair at 10,000 games, and fixes #2 and #3 become alternatives that feel different rather than attempts to reach fairness. Catch-up gets closer (55.7%) but still favors P1, and its "How it plays" table shows why you might pick it anyway.
- **Game length** counts both players' turns (P1 winning on their 5th move = 9 turns).
- **"± x pp"** is the half-width of the Wilson interval, which is slightly asymmetric; the whiskers and bands draw the true asymmetric bounds. Mean game length gets a normal-approximation 95% CI, so it also shows ± and n.
- **Dice Duel runs from one 100,000-battle stream.** Steps 10 / 100 / 1,000 / 10,000 show cumulative snapshots of the same stream, so the bars at 10,000 are the first 10,000 battles of the convergence chart.
- **Show vs Fast.** The mode is global (default Show, toggled with `F`) and applies to step entry and `R`. Slider/toggle changes in the race chapter always run Fast. Going backwards always renders instantly. Show-mode pacing happens on the main thread over checkpoint snapshots from the worker, so the worker never sleeps.
- **One animation rule** (plan D8). Entering a run step or pressing `R` plays the paced build-up; moving a slider or toggle updates straight away. Build-ups replay results that are already computed, and the label in the footer says so ("Replaying the first 100 games"), so the pacing isn't mistaken for the computer being slow.
- **Target bands.** `assess(proportion, target)` compares the CI with a design band: *on target* if the whole CI is inside, a named direction if it is wholly outside, *not enough data* if it crosses an edge. This separates "is a bias detectable?" from "does it matter?": the v1 verdict (does the CI contain 50%?) is gone.
- **"Not enough data" comes with its own way out.** `N` (or the button in the sub-line) runs 100,000 games of the same rules. Because a run's stream depends only on (seed, game, rules), the first 10,000 of those games are the ones already on screen, so the build-up is labelled "Adding games: 50,000 of 100,000", not a fresh run. If it is still unclear at 100,000, the sub-line says to widen the range or nudge the rule instead of running more.
- **Predict first.** Both simulations ask the room to commit before the reveal (2.2, 3.2), on the same screen the answer will appear on, so the reveal lands as a comparison with their guess.
- **Push-your-luck bots ignore the score.** Each plan's turns then have identical odds, so points per turn has an exact answer (banking at 20 or 21: 8.14) and the simulation can be checked against it. A coin decides who starts, so a strategy test is not also a first-move test (the `first-move` preset shows that edge separately). The third bot is ink because no line colour is free for a third player.
- **The careful-versus-greedy pair** (10 and 30) was picked because it looks balanced (careful wins 51.9% at 10,000 games, inside the fair band) while banking at 20 wins 64–66% of games against either. That is the chapter: a naive test says "balanced", a smarter bot breaks it.
- **Loot targets the average, 20 tries ± 1** (plan D11), and the chapter shows the tail beside it: the drought is the problem the average hides. The wait chart's y-axis ignores the pity try, whose spike would flatten every other bar; that bar is cut and its value written beside it.
- **Best-of-N uses a one-sided target**, "the stronger player wins at least 75%", as a band from 75% to 100%. Best-of-45 is exactly on its edge (75.06%), so the simulation can never settle it; the math can. The sweep marks the shortest series that reaches 75% by the exact answer.
- **The boss fight is tuned on boss HP** with the hero fixed at 30 HP: 32 HP is the fair fight (48.69%) and 28 HP hits 70% (70.42%), each one slider step from a clearly different verdict. The handicap reuses the race with the target on P2's share, 58% ± 3: head start 3 (58.67%) is the only whole number inside it.
- **One shared result panel.** The race chapter keeps its own result code (it also has the feel table and the sweep); the library chapters share `ui/match.ts`, which is the same logic with any two sides, any target and any noun ("fights", "series").
- **Step 2.6 zooms in.** On a 0–100% axis the ±0.9 pp whiskers and the exact lines merge into one smudge. The axis zooms to the data instead, and the bars fade into dots on the way, because bars cut off at a non-zero baseline would exaggerate the differences.
- **Single illustrative games** (the one battle in 2.1, the one race in 3.1) are simulated on the main thread: one game takes microseconds. All bulk simulation and `exact()` calls run in the worker.
- **Keys `1`–`9` map to the session's chapters in order** (in the default talk: Title, Dice Duel, Race, Closing). The header band numbers chapters the same way (`2 Dice Duel, Step 3 of 7`), so the keys and the band always agree. Numeric deep links count within the session too; id links (`#race.4`) work in any session that includes the chapter. Added extras: `PgUp`/`PgDn` (clickers), `↑`/`↓` as aliases for `+`/`−`, `T` for theme, and deep links.
- **Reseed** cancels in-flight work by terminating and recreating the worker.
- **"Games simulated"** in the footer is the session total, a nice live counter for the audience.
- **Layouts.** Stage mode (1000 px wide or more, 600 px tall, landscape) fits one screen and scales all type with the window: 16 px at 1280×720, 24 px at 1920×1080, 15 px on a 1024×768 projector. Below 1000 px the page becomes one scrolling column (tablets); below 761 px type and controls shrink further (phones). The design system's stage threshold is 1180 px; it starts at 1000 px here so a 4:3 projector still gets the fit-to-screen layout.
- **The offline copy** is the same app built with `vite-plugin-singlefile`: scripts, styles, fonts and the simulation worker are inlined, and the favicon is a data URL. The worker is a classic (IIFE) script because Chrome refuses module workers from blob URLs on pages opened from disk. `scripts/offline.mjs` fails the build if the file references anything outside itself.
- **Tooling:** Vite 6, TypeScript 5 (strict), Vitest 3.

## Design system

Built on Herman's heyitsherman system: **heyitsherman-web v1.1** with the **heyitsherman-web-game** layer (design-tool mode).

- `src/hih/tokens.css` and `src/hih/hih-web.css` are generated by the game skill's `prepare_design_system.py` from the heyitsherman-web skill. Never edit them; regenerate them when the system changes.
- **Colours.** Paper and Night follow the OS (or `T`, remembered per device). P1 is Cobalt and P2 Mustard (a colourblind-safe pair); Teal means "on target" (the Fair verdict, the fair line, the winning lane, the best point of a sweep). A third player (the smart bot) and an off-target verdict with no side to favour (an average that is too generous) are ink. Line colours fill bars, dice, tokens and strips; text is always ink or muted, and text on a fill uses that colour's own on-colour, so every pair passes AA in both themes. Orange appears only in the mark and favicon. No red and no green.
- **Header band** in neutral ink (the footer band's colour) with the mark; Cobalt appears only as the progress strip, so the band doesn't read as Player 1.
- **Type.** Jost for display headings (Title Case via CSS), Atkinson Hyperlegible Next for captions, labels and body, Zilla Slab for the big numbers, Fira Sans Condensed for data (ticks, margins, the seed). Captions are sentences, so they are Atkinson in sentence case rather than Title Case headings.
- **Shapes.** Square corners everywhere except the dice, race tokens and playtest dots (game pieces keep their real shapes). HP bars are square.
- **Discussion cards** (the last step of Fair Isn’t the Goal) are the design system's lanes, sized up for the stage.
- **Layout stability.** Nothing changes size while a step plays. The sub-line reserves the height of every text its step can show, and the replay label keeps its space when hidden. Check with `?layout-check`: present the whole talk (including re-runs and slider changes), then run `mcb.layoutChanges()` in the console. It must return `[]`.

### Design system exceptions

1. **Simulating problems with exact answers.** The design-tool rule says to compute exactly where possible. Here, agreement between simulation and the math *is* the lesson.
2. **Animated build-ups and counters on explicit runs.** The design-tool motion rule says to update in place. The build-up is the teaching device: it is feedback to a presenter action, it follows one rule in every mode, it is labelled as a replay, and it is off under reduced motion.
3. **No How-to-play guide on load.** It would pop up in front of a class. `Esc` opens the keys.
4. **Process note, not a rule exception.** The source stays Vite + TypeScript. The skill's script prepares the design-system files and Vite imports them, instead of embedding them into a hand-written `index.html`. The single-file output still meets the one-offline-file rule.

## Licenses

- **Code:** MIT. See [LICENSE](LICENSE).
- **Explanatory text** (captions, README prose, on-screen copy): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Fonts:** Jost (Indestructible Type), Atkinson Hyperlegible Next (Braille Institute), Zilla Slab (Mozilla) and Fira Sans Condensed (Mozilla / Telefonica), all under the [SIL Open Font License 1.1](https://openfontlicense.org). Unmodified Fontsource 5.3.0 Latin WOFF2 files; licences in `src/fonts/`.
