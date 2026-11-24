# Answer key

For the [exercises](exercises.md). Lab numbers are from the default seed (`dgt-balance`) at 10,000 runs, so a student who opens the exercise link sees exactly these; exact answers are in brackets. Generated with the same code the Lab runs (`npm run calibrate` reports the same values; see the README's "Measured numbers").

For Design exercises there is no single answer: the key gives reference numbers and what a strong answer looks like.

---

## Explore

### E1. One die each

- **Attacker wins 41.0%**, range 40.0–41.9% (exact 15/36 = **41.67%**). Defender 59.0% (58.33%).
- **Why:** of the 36 ways two dice land, 6 are ties and all go to the defender; the other 30 split evenly, 15 each. So the tie rule alone moves the attacker from 50% to 42%.
- **2 against 2:** attacker sweeps 23.0% (22.76%), split 32.0% (32.41%), defender sweeps 45.1% (44.83%). The defender sweeps about twice as often: two ties to win instead of one.
- **Common wrong answer:** 50%, or "about 45% because ties are rare". Ties are 1 roll in 6.

### E2. Who goes first?

- **Player 1 wins 61.8%**, range 60.8–62.7% (exact **61.89%**): Favors P1.
- **Why:** in a race of equal dice, both players need about the same number of turns. When they need the same number, P1 gets there first, because P1 takes each turn first. Only when P2 needs *fewer* turns does P2 win.
- **Track length:** a longer track helps P2 a little, because the tie-in-turns case becomes a smaller share of games (exact P1 win: 66.1% at 10 squares, 61.9% at 20, 59.8% at 30, 58.5% at 40). Games get longer: 10.4 turns at 20 squares.
- **Strong answers** notice that the effect fades but never disappears.

### E3. A 5% drop

- **Average 19.6 tries** ± 0.4 (exact **20**): On target.
- **Half the players have it by 14 tries** (14).
- **The unluckiest 1 in 100 needs 89 or more** (exact 90). The unluckiest of all 10,000 players needed 168.
- **Why the average misleads:** most players get it sooner than 20, but a long tail of unlucky players pulls the average up. Players complain about the tail; designers usually quote the average.
- **Common wrong answer:** "everyone gets it by about 20" or "the unluckiest need about 40".

### E4. Best of 7

- **Stronger player wins 60.7%** of series, range 59.7–61.6% (exact **60.83%**): Too much luck.
- **Upsets: 39.3%** (39.17%). The weaker player takes two series in five.
- A best-of-7 lasts 5.8 games on average.
- **Strong answers** see that upsets are exciting for viewers and for the weaker player, and frustrating for the stronger one, and that which matters depends on the event.

### E5. Same rule, or different?

- **A (head start 1): P1 wins 55.1%** (55.30%). **B (first-roll bonus +1): P1 wins 55.0%** (55.30%). Both Favor P1.
- **B − A: −0.2 pp ± 1.4**: **too small to tell apart**. The range includes zero.
- **Why:** a +1 on the first roll puts Player 2 exactly one square further after their first move, the same place a 1-square head start would. From then on the two games are identical, so the exact answers are equal.
- **Strong answers** say the small difference on screen is noise, and that "different numbers" doesn't mean "different rules".
- **Worth spotting:** **Lead changes** differ (1.01 against 0.66 per game). With a head start, P2 leads from the very start, so P1 overtaking counts as a lead change. Same odds, and the measure of "feel" still differs, because of where the counting starts.

### E6. The first move, with identical bots

- **10,000 games: bot A wins 52.8%**, range 51.8–53.8%: **Not enough data: run more**. The range crosses 53%, the edge of "fair".
- **Press N (100,000 games): 53.3% ± 0.3**, range 52.9–53.6%: **Still too close to call**. The Lab explains: the true value is right at the edge of "fair", so players won't feel a difference either way.
- **Interpretation:** going first is worth about 3 points, right on the line the designer drew. For the facilitator: a million games (outside the Lab) give 53.25%, range 53.15–53.34%, so the edge is real, and tiny.
- **Also worth spotting:** both bots score 8.1 points per turn, so the plans really are identical; the whole edge is the first move.
- **Strong answers** separate the two questions: *is there an edge?* (yes) and *does it matter?* (barely; many would leave it, or alternate who goes first). Either decision is fine if it's argued.

---

## Tune

### T1. Make the race fair

- **Head start 2: P1 wins 48.1%**, range 47.1–49.1% (exact **48.38%**): **Fair**.
- Head start 0 and 1 favor P1 (61.8%, 55.1%); 3 and up favor P2 (41.6%, 35.2%, 27.8%, 21.1%).
- **Note:** head start 2 is fair but slightly on P2's side (48.4%). With another seed it sometimes reads "Not enough data" at 10,000 runs (about 1 seed in 5); pressing N settles it as Fair.

### T2. Does the fix depend on the die?

Exact P1 win rate by die and head start (Fair = 47–53% in **bold**):

| Die | 0 | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| d4 | 61.0 | **52.3** | 43.3 | 34.4 | 26.0 | 18.6 |
| d6 | 61.9 | 55.3 | **48.4** | 41.3 | 34.4 | 27.7 |
| d8 | 62.8 | 57.4 | **51.7** | 45.8 | 39.8 | 33.8 |
| d10 | 63.9 | 59.1 | 54.1 | **48.9** | 43.7 | 38.4 |
| d12 | 64.5 | 60.3 | 56.0 | **51.5** | 46.9 | 42.3 |

- **d8: the same head start (2)** still works, but only just (51.7%). d10 and d12 need **3**; d4 needs only **1**.
- **Why:** a bigger die moves you further per turn, so one square of head start is worth less.
- The heatmap simulates each cell (10,000 runs) and fills a cell Teal only when its whole range is inside the band. At the default seed, **d4 with head start 1** isn't Teal: 53.1%, range 52.1–54.1%, crosses the edge. Its exact value, 52.3%, is inside the band; set those rules in Results and press N: at 100,000 runs it reads 52.5%, range 52.1–52.8%: Fair.
- **The lesson:** a fix is tuned to the rules it was tuned with. Change any rule and re-run the check.

### T3. Keep the average, end the droughts

- **5% with pity at 40: average 17.2** ± 0.3 (exact 17.43): **Too generous**. Nobody waits past 40.
- **Why it dropped:** the pity timer cuts off the long tail, and the tail was holding the average up.
- **4% with pity at 40: average 20.2** ± 0.3 (exact **20.12**): **On target**. Nobody past 40, half the players by 18 tries.
- **Stretch, pity at 30:** **3%** averages 20.0 ± 0.2 (exact 19.97): On target. 2% gives 22.7 (too stingy), 4% gives 17.65 (too generous). With 3% and pity at 30, about 41% of players get the sword from the timer: ask whether a drop that so many players get on a fixed try still feels like luck.

### T4. Tune the boss

- **Boss HP only: 28 HP**, hero wins 70.4% (exact **70.42%**): On target. 27 HP gives 75.3% (too easy), 29 HP gives 65.2% (too hard).
- **Hero HP only (boss 32): 34 HP**, hero wins 69.4% in the Lab (exact 69.26%): on target, and the only hero HP that is. 33 HP gives 64.5% (too hard), 35 HP gives 73.6% (just too easy).
- **Bigger hero die:** with a d8, a 36 HP boss gives 69.4% (on target; 35 HP gives 73.2%, just too easy). With a d10, 43 HP (71.9%) or 44 HP (68.8%).
- **Feel (28 HP boss, default):** fights last 7.9 rounds; 39.4% of wins are close (a quarter of the HP or less left). The fair 32 HP boss: 8.5 rounds, 34.1% close wins.
- **Strong answers** compare fight length and close wins between their solutions, not only the win rate. More HP all round means longer fights; a bigger hero die means bigger swings.

### T5. How long must a series be?

Shortest series where the stronger player wins at least 75% (exact):

| Edge per game | 55% | 60% | 65% | 70% |
| --- | --- | --- | --- | --- |
| Shortest series | best-of-45 (75.06%) | best-of-11 (75.35%) | best-of-5 (76.48%) | best-of-3 (78.40%) |
| Best-of-7 gives | 60.83% | 71.02% | 80.02% | 87.40% |

- **At 65%, in the Lab:** the sweep shows best-of-1 at 64.2% and best-of-9 at 83.1%; stepping down in Results finds that best-of-5 reaches 75% (77.3% in the Lab, exact 76.48%: Skill wins) and best-of-3 doesn't (71.1%, exact 71.83%: Too much luck).
- At 55% the sweep brackets the answer between best-of-41 (exact 74.08%) and best-of-51.
- **Note:** at a 55% edge, best-of-45 sits right on 75%, so the Lab reads "Not enough data" and still can't call it after N. That's correct: the true value is 75.06%.
- **The lesson:** the closer the players, the longer the series must be for skill to show. Between near-equal players, no practical series length is a reliable test of skill.

### T6. Where should you bank?

- **Bank at 20 or 21: 8.14 points per turn** (exact; they tie). The Lab's sweep tries 13 thresholds, including 17, 21 and 26; 21 is the top (8.09 at the default seed, against 8.01 and 7.96). The talk's sweep, in steps of 5, shows banking at 20 on top.
- The curve is flat at the top: 18 gives 8.09, 25 gives 8.00. Banking anywhere from about 18 to 25 is close to best.
- **Stretch, fixed rolls:** rolling **5 or 6 times** is best (8.04 points per turn, exact; they tie). Bot A rolling 5 times against bot B banking at 20: bot A wins 48.7%, range 47.8–49.7%: **Fair**. A fixed-roll plan can compete, as long as it's the right number.
- **Strong answers** notice that "most points per turn" and "wins most head-to-head" are close but not the same question.

---

## Design: reference numbers

### D1. Your boss

Exact first-try win rate (hero 30 HP, d6 against d6) by boss HP:

| Boss HP | 16 | 20 | 24 | 26 | 28 | 30 | 32 | 36 | 40 | 44 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Hero wins | 99.4% | 96.5% | 87.4% | 79.8% | 70.4% | 59.8% | 48.7% | 28.5% | 14.1% | 6.0% |

- **Strong answers:** the target comes from the player and the moment ("a tutorial boss most players beat first time, 90%: a 22 HP boss gives 92.9%"); the band is stated; the B − A comparison mentions fight length or close wins; the playtest question is about feel (does losing feel fair? is the fight boring?).
- **Weak answers:** pick 50% "because it's balanced", or choose the number after seeing what the sliders produce.

### D2. Fair and exciting

| Rules | P1 wins | Comebacks | Decided early |
| --- | --- | --- | --- |
| Head start 2 (A) | 48.1% (Fair) | 25.5% | 60.0% |
| Head start 2 + catch-up | 51.2% (Fair) | 37.7% | 45.2% |
| First-roll bonus +1 + catch-up | 51.6% (Fair) | 37.9% | 45.8% |
| Head start 3 + catch-up | 47.3% (Fair, near the edge) | 37.8% | 49.5% |
| Catch-up alone | 55.7% (Favors P1) | 35.9% | 43.7% |

- **The starting comparison already meets both targets:** head start 2 plus catch-up is fair and has 37.7% comebacks (B − A for comebacks: +12 points, clearly real).
- **Strong answers** say why catch-up adds comebacks (the trailing player moves faster), and answer the catch-up hater: perhaps a smaller boost, or catch-up only in the second half.

### D3. Your loot promise

Exact average tries for each drop chance and pity timer (On target for an average of 20 ± 1 in **bold**):

| Pity at | 2% | 3% | 4% | 5% | 6% |
| --- | --- | --- | --- | --- | --- |
| none | 50.0 | 33.3 | 25.0 | **20.0** | 16.7 |
| 25 | **19.8** | 17.8 | 16.0 | 14.5 | 13.1 |
| 30 | 22.7 | **20.0** | 17.7 | 15.7 | 14.1 |
| 35 | 25.4 | 21.9 | **19.0** | 16.7 | 14.8 |
| 40 | 27.7 | 23.5 | **20.1** | 17.4 | 15.3 |
| 50 | 31.8 | 26.1 | 21.8 | **18.5** | 15.9 |
| 60 | 35.1 | 28.0 | 22.8 | **19.1** | 16.3 |

- With pity at 25 and a 2% drop, most players get the sword *from the timer*: the "random" drop is a fixed wait in disguise.
- **Strong answers** state both numbers of the promise, show the chart's spike at the pity timer, and discuss whether players should see the timer.

### D4. Your tournament

Exact series win rate for the stronger player at a 55% edge:

| Best of | 1 | 3 | 5 | 7 | 9 | 15 | 21 | 31 | 45 | 61 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stronger wins | 55.0% | 57.5% | 59.3% | 60.8% | 62.1% | 65.4% | 67.9% | 71.3% | 75.1% | 78.4% |

- **Strong answers** choose a different target for different stages (short and upset-prone early, longer in the final), check **Games played** for practicality, and admit that a long series is the only way to reward a small edge.

### D5. Your handicap

P2's win rate by head start (exact):

| Head start | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P2 wins | 38.1% | 44.7% | 51.6% | 58.7% | 65.6% | 72.3% | 78.4% |

- The talk's example target is 58% ± 3 for a newer P2: head start 3 (58.4% in the Lab, exact 58.67%).
- **Strong answers** justify the target from the players' skill gap (the handicap should roughly cancel it, so the *experience* is even), and take a position on telling the player.
