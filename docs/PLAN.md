# Plan: from a 5-minute talk to a modular teaching kit

*Agreed 23 Nov 2026. Execution starts only on an explicit go, phase by phase, in order.*

## Goal

Turn "Run it 10,000 times" from a fixed 5-minute talk into a modular kit for teaching Monte Carlo simulation as an add-on to game design fundamentals:

- **Presenter first.** Herman drives it on a projector, picking whichever chapters suit the session, from a 5-minute slot to a full class segment. Modularity is built in but not signposted.
- **Students second.** They use the same tool hands-on, with no code, at whatever depth they can manage.
- **Balanced means on target, not fair.** Fairness is one possible target among others. Sometimes a design should be unfair, and the tool should say why.

## Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | Chapters are self-contained; sessions are playlists of chapters | The same tool serves 5-minute slots and longer segments |
| D2 | Presenter-led, with a no-code student Lab | Mostly projected, with some hands-on |
| D3 | No student-facing code (JS or Python), and no spreadsheet in student materials | This is a game design add-on, not a coding course. Students can't be assumed to know a language. |
| D4 | Student work is tiered by depth of design thinking (Explore, Tune, Design), not by tool | Mixed classes |
| D5 | Verdicts use target bands ("On target / Too easy / Too hard", "Favors P1/P2") instead of a significance test against 50% | Separates "detectable" from "matters", and lets targets sit away from 50% |
| D6 | Intentional unfairness gets its own chapter: a boss fight (target **70% first-try wins**) and a handicap as a choice | Students shouldn't leave thinking fairness is the only goal |
| D7 | House style (heyitsherman-web-game), plus a single-file build output | Herman's design system; one offline file satisfies its binding rule |
| D8 | One animation rule in every mode: explicit runs play the paced build-up, tweaks update instantly, and replays are labelled honestly | Behaviour that differs by mode would mislead students |
| D9 | Audio on by default, synthesised, with mute on M and in the footer, remembered per device | Herman's request. A room full of laptops can be muted once. |
| D10 | Build in phase order | Herman's preference. Phases 0 and 3 already improve the existing talk. |
| D11 | Phase 4 targets: push your luck has a clear dominant strategy; loot drops target the average; best-of-N uses a 55% edge and a ≥ 75% series win | Clarity makes the lesson understandable and sticky (details in Phase 4) |
| D12 | Remove auto-resume; the header uses neutral ink, with Cobalt as an accent; the worksheet is an editable doc | Agreed 23 Nov 2026 |
| D13 | The race's fairness band is 50% ± 3, and "Not enough data" comes with an on-screen prompt and a one-key fix | Agreed 24 Nov 2026; details under "Decided after the plan was agreed" |

## Design-system exceptions (to list in the README)

1. **Simulating problems with exact answers.** The design-tool rule says to compute exactly where possible. Here, agreement between simulation and the math *is* the lesson.
2. **Animated build-ups and counters on explicit runs.** The design-tool motion rule says to update in place. The build-up is the teaching device. It is feedback to a user action, it applies the same way in every mode (D8), and it is off under reduced motion.
3. **No How-to-play guide on load in presenter mode.** It would pop up in front of a class. Esc opens help, and the Lab gets a one-line lead instead.
4. **Process note, not a rule exception.** The source stays Vite + TypeScript. The skill's scripts prepare the design-system files, and Vite imports them instead of embedding them into a hand-written `index.html`. The single-file output still meets the one-offline-file rule.

---

## Phase 0: Fixes and hygiene

| Item | Change | Files |
|---|---|---|
| 0.1 | Step 2.6: zoom the bar chart's y-axis (tweened) so the whiskers and the exact lines can be told apart on a projector. At 0–100% they merge into one smudge. | `src/ui/charts/barChart.ts`, `src/ui/chapters/diceDuel.ts` |
| 0.2 | A key that closes the help overlay must not also act (→ currently advances the slide) | `src/ui/presenter.ts:250` |
| 0.3 | Reproduce and fix the 4 console errors seen while jumping between deep links (#2.5 → #3.2 → #3.6 → #3.4 → #2.6). **Result:** not an app bug. They were Vite's dev-server WebSocket reconnect attempts, logged because the dev server was stopped while the page was open (reproduced exactly). Deep links, rapid keyboard navigation, reseeds, resizes and the production build all run with a clean console. | none |
| 0.4 | Stop the two timing assertions (< 300 ms) from blocking deploys on slow CI runners: move them to a benchmark script | `tests/games.test.ts:39`, `:109` |
| 0.5 | Turn the calibration report into a script, so `npm test` only runs real assertions. `npm run calibrate` stays. | `tests/calibrate.test.ts` → `scripts/` |
| 0.6 | README: remove the references to "the PRD" | `README.md` |
| 0.7 | Remove auto-resuming the last chapter. Playlists and deep links cover rehearsal. *(Confirmed.)* | `src/ui/presenter.ts:129` |

**Done when:** tests and the type-check pass, the browser console is clean through the deep-link sequence above, and step 2.6 is readable at 1280×720.

## Phase 1: Engine groundwork

| Item | Change |
|---|---|
| 1.1 | **Parameter descriptors** on `Game`: `params: { key, label, kind: int / toggle / choice, min, max, step, unit, help }`. Chapter controls and Lab controls are generated from them. |
| 1.2 | **Metric descriptors** on `Game`: `metrics: { id, label, kind: proportion / mean / distribution, read(agg) }`, so charts and the Lab work for any game |
| 1.3 | **Target bands**: `assess(proportion, target)` with `target = { center, tolerance, labels }`. **On target** if the 95% CI lies inside the band, **off target** (named direction) if it lies entirely outside, **"Not enough data, run more"** if it crosses a band edge. Default 50% ± 2 for symmetric games. Replaces `verdict()`. |
| 1.4 | **Bot strategies as config**: a `strategy` choice plus numeric strategy parameters, so strategies can be swept like any other setting. `simulate` stays pure. |
| 1.5 | **Playlists and overview**: `?set=duel,race,…` by chapter id. An overview screen (O key) lists chapters with step counts and rough minutes. Hash links use ids (`#race.4`), which stay stable across playlists. The footer numbers chapters within the playlist. |
| 1.6 | **Run/tweak animation rule** (D8) in one shared helper. Build-ups show "Replaying the first 10 … 100 … 1,000 games". The Show/Fast setting stays visible. |
| 1.7 | **Audio** (`src/ui/audio.ts`, WebAudio, no files): dice roll, run start, batch tick (at most about 6 per build-up), verdict landing, target-hit chime. Unlocks on the first gesture. M key and footer button. Mute stored per device (try/catch). |

**Done when:** tests cover the descriptors against `defaultConfig`, the target-band cases (inside, outside, straddling) and playlist parsing; the existing talk behaves as before apart from the intended changes; sound works after the first keypress and the mute setting survives a reload.

**Notes from execution:**
- The talk still shows the v1 verdict, now implemented as `assess()` with a zero-width band. Switching to `FAIR_TARGET` is Phase 3 (see "Still open").
- The replay label sits right-aligned in the footnote row. Top-centre collided with the race's rules chip.
- Fixed a pre-existing tween bug: animation-frame timestamps can precede the tween's start, so every tween briefly overshot backwards (visible as a negative bar width at 0%).
- The race's first-roll bonus is now a 0–3 setting (the talk still uses 0 or 1); exact vs simulation is tested at 3.

## Phase 2: House style and single-file build

- Load `heyitsherman-web` (parent) and `heyitsherman-web-game`. Prepare the design-system files with the skill's script and record the parent version in the README.
- **Fonts:** Jost, Atkinson Hyperlegible Next, Zilla Slab, Fira Sans Condensed, each in its role (Fira for data tables).
- **Colours:**
  - P1 **Cobalt**, P2 **Mustard** (colourblind-safe pairing); "on target" **Teal**.
  - Orange appears only in the mark and favicon. Red appears only for danger. There is no green.
  - The header band uses neutral ink, with Cobalt only as an accent, so it doesn't read as "P1" (D12).
- **Shapes:** square corners everywhere except dice and tokens.
- **Layout:** stage mode at 1180 px and wider, with type scaling to the window and state values at least 56 px at 1280×720. Register changing text in `RESERVED`; `?layout-check` must report no layout shifts.
- **Single file:** `vite-plugin-singlefile` plus an inline worker (`?worker&inline`), `npm run build:single`. CI publishes it alongside the Pages site as `offline.html`, linked from the README and the help overlay.

- **Known phone issue (from v1):** at 375 px the race's slider card overflows its column (its unit label is clipped). Fix it with the phone layout.

**Done when:** checked by eye at 375, 768, 1280×720 and 1920×1080 in both themes; AA contrast holds for every colour pair; `offline.html` opens from disk with the network off and makes no requests.

**Notes from execution:**
- Built on heyitsherman-web v1.1 (recorded in the README). The header band is ink with the mark, the chapter and step, and icon buttons for the controls (they moved up from the footer); the footer now holds the footnote, the replay label and the session meta on one row.
- Stage mode starts at 1000 px wide (not the skill's 1180) so a 1024×768 projector keeps the fit-to-screen layout; below 1000 px the page is one scrolling column. Listed in the README.
- Formatting changes to on-screen words: arrow glyphs replaced by drawn arrows (duel comparisons, help keys), "tie → defender" became "tie, defender wins", "rolls 4 → square 7" became "rolls 4, moves to square 7", the flag emoji on the finish square became "Finish", "⚠ n capped" became "n games hit the turn cap", the title hint reads "Press Space to begin, Esc for keys", and the overview heading reads "This session: 4 chapters, about 5 minutes".
- The simulation worker is now a classic (IIFE) script: Chrome refuses module workers from blob URLs on pages opened from disk (found by running `offline.html` from disk with the network blocked).
- `?layout-check` found one shift (the footer grew 5 px when the replay label appeared); fixed, and a full pass through the talk with re-runs, slider changes and a reseed now reports none.

## Phase 3: Sharpen existing chapters

| Item | Change |
|---|---|
| 3.1 | **Predict-first beats**: Dice Duel step 1 ("Which outcome is most likely?") and before the race verdict ("What % does P1 win?") |
| 3.2 | **New chapter "Ten playtests prove nothing"**: 20 groups each play 10 games of the 61.8% race, shown as a grid of small results; count how many groups would have called it fair or P2-favoured. Self-contained, so it fits any playlist. |
| 3.3 | **Race verdicts use target bands** (Phase 1.3) with the fairness band at 50% ± 3 (D13), plus the "Not enough data" prompt and its N key (see "Decided after the plan was agreed"). Add a caption beat on the coin flip: "fair across games, not within a game". |
| 3.4 | **Catch-up "feel" metrics**: lead changes per game, comeback rate (the winner was behind at the halfway turn), and share of games decided early. Extend `RaceOutcome`. Labelled simulation-only. |
| 3.5 | **Closing takeaways** gain "Balanced means on target" and "Fair isn't always the goal". Each chapter's last step gets its own one-line takeaway, so any playlist ends cleanly. |

**Done when:** calibrate numbers are regenerated, the README tables are updated, and the default 5-minute playlist still runs in about 5 minutes.

**Notes from execution:**
- The predict beats are steps of their own (Dice Duel 2.2, race 3.2), shown on the screen the answer will appear on, with question marks. Later steps shift by one, so deep links changed: the head-start sweep is now `#race.5`.
- The default talk is about 5½ minutes (the two predict beats add about 30 seconds). "Ten Playtests Prove Nothing" (`playtests`, about 1½ minutes) is in the library but not in the default playlist; add it with `?set=title,duel,race,playtests,closing`.
- The groups' games are the first 200 games of the race's own run for the seed, so the chapter's truth (10,000 games) contains them. Default seed: 6 of 20 groups get it wrong (all 5–5 ties); exact expectation 6.4.
- `verdict()` is gone; every verdict uses `assess()` with `FAIR_TARGET` at 50% ± 3. The tug-of-war and the sweep shade the band; a crossed edge is drawn solid with its value.
- The "Not enough data" prompt lives in the sub-line (Mustard bar, with a button), not under the verdict: the readout had no spare height at 1280×720, and the sub-line reserves the prompt's height, so nothing moves when it appears. The resolved line gets the Cobalt bar.
- Feel metrics read the leader after each full round, so moving first is not counted as a lead. Catch-up versus baseline (10,000 games): comebacks 35.9% vs 24.1%, decided early 43.7% vs 59.0%, lead changes 0.82 vs 0.68. They replace the game-length histogram in step 3.7 (the histogram chart stays for the Lab).
- Takeaways: Dice Duel ends on "When the math is too ugly to do, you run the simulation instead", the race on "Every fix changes how the game feels", and Ten Playtests on "Ten playtests tell you how a game feels, not what its odds are". The closing has five takeaways.

## Phase 4: New chapters

Each chapter is self-contained, has an exact answer to check against where one exists, comes with Lab presets, and has its balance target agreed with Herman before tuning.

| Chapter | Design fundamental | Monte Carlo point | Exact answer | Target |
|---|---|---|---|---|
| **Push your luck** (an original Pig-style game: roll until you hold or bust on a 1) | Dominant strategies; decisions | A naive bot says "balanced", a smarter bot breaks it; sweeping the hold threshold finds the best play | Expected score per turn for hold-at-N | **Agreed:** holding at about 20 is the strongest simple strategy, and a bot that always rolls a fixed number of times clearly loses to it. The lesson is that a dominant strategy exists and simulation finds it. |
| **Loot drops and pity timers** | How randomness feels; the worst-case player | Spread and rare cases: median versus 90th/99th percentile attempts; a pity timer as the balancing fix | Geometric distribution, plus the closed form with pity | **Agreed:** keep the average, remove the droughts. A plain 5% drop averages 20 tries, but 1 player in 100 needs 90 or more. Adding pity at 40 cuts the average to 17.4, so the base chance must come down too. A 4% drop with pity at 40 averages 20.1 tries and nobody waits past 40. Students tune the base chance and pity together. |
| **Best-of-N** | Skill versus luck; match format | How many games until the better player reliably wins; a short series as deliberate upset potential | Binomial | **Agreed:** a 55% per-game edge; find the shortest series where the better player wins at least 75%. Exact answer: **best-of-45** (75.06%; best-of-7 gives only 60.8%). The size of that number is the lesson: small edges drown in luck, which is why leagues play long seasons and a short series is a choice for drama. |
| **Fair isn't the goal** | Intentional unfairness | Tuning toward a target that isn't 50% | Boss fight: dynamic programming over HP states | **Boss: 70% first-try wins (agreed).** Handicap: "P2 is the newer player, aim for 58%": a 3-square head start gives P2 58.67% exactly, so the head start that was "too far" for fairness is right on target for the handicap. |

Snowball rules, house edge and roguelike win rates are discussion prompts in that chapter, not simulations.

**Done when:** each game has exact-versus-simulation tests; each target is met and reported with real numbers; each preset moves the numbers the way its blurb claims.

### Notes from execution (Phase 4)

- Four chapters in the library, none in the default playlist: `luck` (2 min), `loot` (2 min), `bestof` (1¾ min), `unfair` (2½ min). The whole library runs about 15 minutes.
- **Design choices that fill in details the plan left open** (each is listed in the README's Decisions):
  - Push your luck: bots bank at a fixed turn total and ignore the score, a coin decides who starts, and the goal is 100. The naive test is careful (bank at 10) against greedy (bank at 30); the smarter bot banks at 20.
  - Boss fight: hero 30 HP, hero hits for a d6, then the boss hits back for a d6. Tuned on boss HP: 32 HP is the fair fight, 28 HP is the 70% target.
  - Targets: boss 70% ± 3, handicap P2 58% ± 3, loot average 20 ± 1 tries, best-of-N "at least 75%" as a band from 75% to 100%.
- **Targets met** (exact, confirmed by simulation at 200,000 runs in the tests): banking at 20 (and 21) scores the most per turn, 8.14; smart beats careful 66.0% and greedy 63.8% at 10,000 games, and a bot that always rolls three times wins only 34.7% against it. Loot 4% with pity at 40 averages 20.12 tries with nobody past 40 (5% plain: 20, 1 in 100 at 90+; 5% with pity: 17.43). Best-of-45 is the shortest series at 75.06%. Boss 28 HP: 70.42%. Handicap head start 3: P2 58.67%.
- Best-of-45 sits on the target's edge, so at 10,000 series it reads "Not enough data", and N ends on "Still too close to call". That is true and useful in class: the simulation brackets the answer, the math names it.
- Every game (and the race) has presets with one-line lessons; `tests/moreGames.test.ts` checks each claim.
- New shared pieces: `assess()` takes any estimate with a range (so a mean can have a target band), the "Not enough data" sentences name what was simulated ("fights", "series"), `ui/match.ts` is the race's result logic for any two sides, and two charts (a dot sweep for any estimate, a wait chart for tries per player).

## Phase 5: Lab

- **Route:** `?lab`. Two panes: inputs on the left, results on the right; stacked on phones. A seed field is visible.
- **Game picker** with controls generated from the parameter descriptors.
- **Presets as lessons**, each with a one-line blurb naming what it teaches.
- **A/B comparison** of two rule sets side by side, with the difference and its CI.
- **Sweeps**: 1D for any numeric setting, 2D as a heatmap (via the existing `sweep()`).
- **Run-count calculator**: "To detect a 2 pp edge you need about N runs."
- **CSV export** of the current results or sweep.
- **"Open in Lab"** from every chapter, carrying its current rules. Lab state is encoded in the URL, so students can share findings.
- The same animation rule (D8) and the same audio as presenter mode.

**Done when:** every game works in the Lab with no game-specific UI code; a URL round-trips the Lab state; it is usable at 375 px.

## Phase 6: Teaching kit (`docs/teaching/`)

- **Facilitator guide**: a menu of segments with timings and playlist URLs, talking points, likely misconceptions, and discussion prompts (including when unfairness is the goal).
- **Tiered worksheet**: Explore (predict, run, explain), Tune (hit a target band), Design (choose and defend a target, then find rules that hit it). An **editable doc**, so the questions can be adapted per class (D12).
- **Exercises with an answer key**, with numbers quoted from a fresh calibrate run.
- **Unplugged dice activity**: pool the class's rolls on the board, then compare with the simulation.
- *Optional, cut first:* a short spreadsheet appendix for the instructor only.

---

## Decided after the plan was agreed

1. **Race storyline under target bands (D13, 24 Nov 2026): option (b), a fairness band of 50% ± 3.** Under ± 2, head start 2 (exact 48.38%) read "Not enough data" even at 200,000 runs. Under ± 3 it reads "Fair" at 10,000 runs with the default seed, and the storyline becomes "head start 2 is fair enough; fixes #2 and #3 are alternatives that feel different". How often head start 2 reads "Not enough data" (from the exact odds): 21% of seeds at 10,000 runs, 2.6% at 20,000, effectively never at 100,000. Head start 1 does so 0.4% of the time at 10,000 runs; the other race configurations never. `FAIR_TARGET` changed to ± 3 in Phase 3.
2. **"Not enough data" prompt (Phase 3, shared by the talk and the Lab).** Written for the room, because the projector shows everything:
   - The verdict stays "Not enough data: run more". Under it, one sentence with the real numbers: "Too close to call. The likely range, 47.1–49.1%, crosses the edge of "fair" at 47%. More games shrink the range." The crossed band edge is highlighted on the chart where the range bar crosses it.
   - One action, as a button and a key: **Run 100,000 games (N)**. It is an explicit run, so it follows D8: the chart adds games from 10,000 to 100,000 (label "Adding games: 50,000 of 100,000") and the range visibly shrinks until it clears the edge.
   - When it resolves, the prompt becomes one line: "Fair. 100,000 games: 48.1–48.7%, inside 47–53%. It took 10× more games because the answer sits near the edge."
   - If it is still unclear at 100,000 (possible only in the Lab), the button goes and the prompt reads: "Still too close to call. The true value is right at the edge of your "fair" range, so players won't feel a difference either way. Widen the range, or nudge the rule."
   - Its space is reserved (no layout shift). Facilitator guide line: "If you see 'Not enough data', press N and narrate the shrinking range."

Exact numbers in Phase 4 are to be reconfirmed by the chapter tests when each game is built.

## Checks for every phase

`npm test`, `npm run build` (type-check plus build), a browser check of the affected screens at projector and phone size in both themes, a clean console, and README numbers regenerated with `npm run calibrate` whenever simulation output changes.
