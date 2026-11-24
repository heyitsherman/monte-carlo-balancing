# Facilitator guide

How to run "Run it 10,000 times" as part of a game design class: anything from a 5-minute slot to a 90-minute segment. Students need no code and no maths beyond percentages.

**The idea in one breath:** probability tells you what *should* happen; when a game is too tangled to calculate, a simulation plays it thousands of times and tells you what *does* happen. Small edges need thousands of runs to see. A balanced game is one that hits the target you chose, and fair (50%) is only one possible target. A simulation only knows what its simulated players know, so it complements playtesting and doesn't replace it.

**Links**

- Talk: https://heyitsherman.github.io/monte-carlo-balancing/
- Lab (students): https://heyitsherman.github.io/monte-carlo-balancing/?lab
- Offline copy (one file, runs from a USB stick): https://heyitsherman.github.io/monte-carlo-balancing/offline.html

The rest of the kit: [worksheet](worksheet.md), [exercises](exercises.md) with an [answer key](answer-key.md), and the [unplugged dice activity](dice-activity.md).

---

## Before the session

- [ ] Open the talk link for your segment (menu below) on the projector, full screen (`F11`).
- [ ] Press any key once so the browser allows sound, then check the volume. `M` mutes.
- [ ] Press `O` for the overview: it lists every step of the session and the chapters it leaves out.
- [ ] If the room's network is unreliable, copy `offline.html` to the laptop. The talk and the Lab both work from it.
- [ ] For hands-on work, have the Lab link ready to share (a QR code or a short link). Students need a laptop or tablet; phones work but are cramped.
- [ ] Don't press `S` while rehearsing unless you want new numbers. The default seed gives the numbers quoted in this kit every time; reloading the page returns to it.

**Keys you'll use:** `→` / `Space` next, `←` back, `R` run again, `+` / `−` change the setting on screen, `N` run 10× more when the screen says "Not enough data", `O` overview, `L` open this step in the Lab, `Esc` all keys. A presentation clicker works for next and back.

---

## Segment menu

Pick a row, open its link, and the talk steps through only those chapters. Chapter ids: `title`, `duel`, `race`, `playtests`, `luck`, `loot`, `bestof`, `unfair`, `closing`. Any order works; every chapter stands on its own.

| Time | Segment | Link (add to the talk link) | Students do |
| --- | --- | --- | --- |
| 3 min | One idea: fairness is measured, not felt | `?set=race,closing` | Predict P1's win rate |
| 5½ min | The default talk | *(no addition)* | Predict twice, vote on the fixes |
| 6 min | Balance is a target | `?set=title,race,unfair,closing` | Predict, then argue about the boss |
| 5 min | How randomness feels | `?set=title,loot,luck,closing` | Predict the unluckiest player |
| 4 min | Why simulate at all | `?set=duel,playtests,closing` | Predict, then judge the 20 groups |
| 15 min | The whole library | `?set=title,duel,race,playtests,luck,loot,bestof,unfair,closing` | Predict at every chapter |
| 20–25 min | Dice first, then the talk | Dice activity, then `?set=duel,playtests,race,closing` | Roll, pool, compare |
| 45 min | Talk plus Lab | Dice activity (10), a 6–10 min talk, Lab: Explore (15), share-out (8) | Worksheet: Explore |
| 60–90 min | Full segment | Dice activity (10), the whole library (15), Lab: Tune (20), Design (20–30), share-out (10) | Worksheet: all three tiers |

Times are for the talk running at its own pace with short discussions. The overview (`O`) shows the session's total.

### Running the Lab hands-on

- Every exercise has a link that opens the Lab with its rules already set. Share the link, not instructions for finding the settings.
- **Tiers are about depth of thinking, not ability with tools.** Everyone uses the same Lab. Explore: predict, run, explain. Tune: hit a target band someone else chose. Design: choose your own target, defend it, then find rules that hit it. Let students move up a tier when they're ready rather than assigning tiers.
- **Findings travel as links.** The Lab's address holds the game, rules, runs and seed, so a student who pastes their link into the class chat shows exactly what they saw. Use this for the share-out.
- The Lab's **"How many runs?"** line answers "is 10,000 enough?" for any edge a student cares about.
- Pressing **Run** replays the build-up from 1 run; moving a slider updates at once. Both show the same numbers.

---

## Chapter notes

Each chapter: what to say, what to ask, what students tend to get wrong, and where to go next. Numbers are from the default seed.

### Dice Duel (`duel`, 1¾ min)

Attacker rolls 3 dice, defender 2; highest against highest, second against second, ties go to the defender.

- **Ask (step 2):** "Which outcome is most likely: attacker wins both, a split, or defender wins both?" Take a show of hands. Most people pick the split or the defender, because ties go to the defender.
- **Say:** the attacker sweeps 37%, the defender 29%. The extra die outweighs the ties. Watch the whiskers shrink from 10 battles to 10,000: that's the simulation learning.
- **Say (step 7):** the exact answer is 2,890 sweeps out of 7,776 rolls. Here we can count every roll, so the simulation is checking itself against the maths. Most games are too tangled to count, and then the simulation is all you have.
- **Misconception:** "the whisker is the spread of battles". It's how unsure we are about the percentage; it shrinks with more runs while individual battles stay just as random.
- **Next:** exercise E1 (one die each), or the [dice activity](dice-activity.md) before the talk.

### The First-Player Problem (`race`, 2¾ min)

A race to square 20 on one d6; P1 always moves first.

- **Ask (step 2):** "Out of 100 games, how many does Player 1 win?" Everyone commits to a number before the reveal.
- **Say:** 62%. Moving first is worth 12 points. A single game showed nothing (step 1): fairness only exists across many games.
- **Fix #1 (step 4):** press `+` for each head start square. 1 still favors P1, 2 is fair (48.1%), 3 swings to P2. The fair band is 47–53%: "close enough" was decided *before* running.
- **Fix #2 and #3:** +1 on P2's first roll is the same maths as a 1-square head start. Catch-up (whoever is behind rolls 2 dice) barely moves the win rate, but comebacks go from 24% to 36%: it changes how the game *feels*.
- **Misconception:** "fair means 50% exactly". The band is a design choice; nobody can feel 48% versus 50%.
- **Misconception:** "the fix that makes it fair is the best fix". Read the "How it plays" table: length, lead changes, comebacks.
- **Next:** T1 (find the head start), T2 (does the fix depend on the die?), D2 (fair *and* exciting).

### Ten Playtests Prove Nothing (`playtests`, 1½ min)

20 groups each play 10 games of the same race.

- **Ask:** "Each group writes a balance report from its 10 games. How many reports are wrong?"
- **Say:** with the default seed, 6 of 20 groups call the game fair or miss P1's edge, though it's a 62–38 game. Ten playtests tell you how a game feels, not what its odds are.
- **Misconception:** "our playtests showed it's fine". Playtests are for feel, confusion and fun; percentages need thousands of games.
- **Pairs well with:** the dice activity, where the class sees the same thing with its own dice.

### Push Your Luck (`luck`, 2 min)

Roll a d6 as often as you dare; a 1 wipes the turn's points; bank to keep them; first to 100.

- **Ask (step 2):** "Careful (banks at 10) or greedy (banks at 30)?"
- **Say:** 52–48: the test says both styles work, so the game looks balanced. Then a third bot that banks at 20 beats both, two games in three. A naive test said "balanced" because both bots were bad.
- **Say (step 5):** banking at 20 scores the most per turn (8.14 points). If one plan always wins, the choice is gone, and players will find it.
- **Misconception:** "the simulation proves the game is balanced". It proves the *bots* are balanced. Simulate smart players, or the result means nothing.
- **Discussion:** is a dominant strategy always bad? (Tic-tac-toe has one; nobody plays it twice.) How would you change the rules so banking at 20 isn't always right?
- **Next:** T6 (find the best threshold), E6 (the first-move edge).

### Loot Drops and Pity Timers (`loot`, 2 min)

One "game" is one player farming a 5% drop. Target: an average of 20 tries ± 1.

- **Ask (step 1):** "The unluckiest player in 100: how many tries do they need?" Most guess 30–50.
- **Say:** the average is 20, half get it by 14, but 1 in 100 needs about 90 tries and the unluckiest of 10,000 needed 168. That player writes the angry review.
- **Say (steps 3–4):** a pity timer (guaranteed on try 40) ends the droughts, but the average drops to 17: too generous. Lower the chance to 4% (`−` once) and the average is back to 20 with nobody past 40.
- **Misconception:** "a 5% drop means you get it in 20 tries". 20 is the average, and the average hides the tail.
- **Discussion:** what's the worst wait your players will accept? Should the pity timer be visible to them?
- **Next:** T3 (tune the chance with pity), D3 (make your own promise).

### Best of N (`bestof`, 1¾ min)

The stronger player wins 55% of single games. Target: they win at least 75% of series.

- **Ask (step 1):** "You win 55% of games. How often do you win a best-of-7?" Many say 80–90%.
- **Say:** 61%. A best-of-7 barely helps. It takes a best-of-45 to reach 75%. Small edges drown in luck, which is why leagues play long seasons and why a short knockout is a choice for drama.
- **Expect "Not enough data" at best-of-45.** The true value is 75.06%, right on the edge of the target, so no number of runs settles it. Say exactly that: "it's on the line; any player would feel 75% either way".
- **Discussion:** should a tournament final be long (skill decides) or short (anyone can win)? What does each feel like to watch?
- **Next:** T5 (bigger edges), D4 (choose a format).

### Fair Isn’t the Goal (`unfair`, 2½ min)

A boss fight (you have 30 HP; you hit for a d6, then the boss hits back for a d6), then the race as a handicap.

- **Ask (step 2):** "This boss beats half of all players. Would you ship it?" Usually: no, half the players quit.
- **Say (step 3):** the target is 70% of players winning on their first try. That's unfair on purpose, and it's on target. Four presses of `−`: a 28 HP boss gives 70.4%.
- **Say (step 4):** a handicap for a newer P2, aiming at 58%. The 3-square head start that was "too far" for fairness is exactly right here.
- **The three cards (step 5)** are discussion prompts: house edge, roguelike runs, snowballing. Pick one and give the room a minute.
- **Misconception:** "balanced means fair". Balanced means on the target you chose for the experience you want.
- **More prompts on intentional unfairness:**
  - A tutorial boss: who is it for, and what should its first-try win rate be? A final boss?
  - Asymmetric games (one hunter against four survivors): what should each side win, and why not 50%?
  - Rubber-banding in racing games: helpful for a newcomer, insulting for an expert. Who decides?
  - When is it fine for the house to win? When does it feel like cheating?
- **Next:** T4 (tune the boss), D1 (your own boss), D5 (your own handicap).

### Closing (`closing`, ½ min)

Five things to take home: run it thousands of times; balanced means on target; fair isn't always the goal; change one thing, re-run, compare; the simulation only knows what its players know, so playtest anyway.

---

## When things don't go to plan

- **"Not enough data: run more".** The likely range crosses the edge of the target band, so the result can't be called yet. The sub-line says which edge. **Press `N` and narrate the range shrinking** as 10× more runs are added; the sub-line then gives the settled verdict. It's a teaching moment, not a fault: "the answer is close to the line, so we need more evidence".
- **It still says "Too close to call" after `N`.** The true value is on the edge of the band (best-of-45 is the known case). Say so: players can't feel the difference either way, so widen the band or nudge the rule.
- **You pressed `S` and the numbers no longer match your notes.** Reload the page to return to the default seed.
- **No sound.** Browsers only play sound after the first key press or click. Check `M` and the laptop's volume.
- **No network.** Use the offline copy. Everything works from it, including the Lab.
- **A student's Lab shows different numbers from yours.** Check the seed and the number of runs in their link. Same link, same numbers.

## What good student thinking sounds like

Use these to judge explanations on the worksheet, at any tier:

- **Uses the range, not just the number.** "48%, likely between 47 and 49, which is inside 47–53" beats "48%, so fair".
- **Separates "detectable" from "matters".** A 0.5-point edge can be real and still not worth fixing.
- **Names the side effects.** "Fair now, but comebacks dropped" or "average is right, but 1 in 100 still waits 90 tries".
- **Defends the target before the rules.** In Design, "who is this for and what should it feel like" comes first; the number follows.
- **Knows what the simulation can't see.** Bots don't get bored, frustrated or clever. Something still needs a playtest.
