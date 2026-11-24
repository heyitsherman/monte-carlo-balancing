# Unplugged dice activity: pool the room

**10 minutes, before any screen.** The class runs a tiny Monte Carlo simulation by hand: every pair plays a few battles, the board pools them, and the pooled number gets close to an answer nobody in the room predicted. Then the computer does the same thing 10,000 times.

It works on its own, and it sets up the Dice Duel and Ten Playtests chapters of the talk.

## You need

- One six-sided die per student (or two per pair).
- The board, split into a tally table (below).
- The talk or the Lab ready to show afterwards.

## The game: one die each

Two players. The **attacker** and the **defender** each roll one die. Higher number wins. **Ties go to the defender.**

## Steps

1. **Predict (1 min).** Ask: "Out of 100 battles, how many does the attacker win?" Everyone writes a number. Most of the room says 50, or "a bit under 50 because of ties".
2. **Play (3 min).** In pairs, play **10 battles**, taking turns as attacker. Tally attacker wins out of 10.
3. **Report (2 min).** Each pair calls out its score. Write each one on the board, then a running total:

   | Pair | Attacker wins (of 10) |
   | --- | --- |
   | 1 | |
   | 2 | |
   | … | |
   | **Class total** | ___ of ___ battles = ___% |

4. **Read the spread (1 min).** Ask: "If your pair were the only playtest, what would you conclude?" Some pairs will have seen the attacker win 6 or more; some only 2. Same game, same dice.
5. **Read the total (1 min).** The pooled percentage lands near **42%**, not 50%.
6. **Run it 10,000 times (2 min).** Open the Lab with one die each: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=diceDuel&a.attackerDice=1&a.defenderDice=1 and press Run. Compare the class's number with the Lab's, and the class's spread with the Lab's ± range.

## The numbers

- **Exact answer:** the attacker wins 15 of the 36 ways two dice can land, **41.7%**. Six of the 36 are ties, and they all go to the defender, so the defender wins 58.3%.
- **The Lab, 10,000 battles (default seed):** attacker 41.0%, likely range 40.0–41.9%.
- **One pair's 10 battles** can land almost anywhere: a pair sees the attacker win 5 or more times **41% of the time**, and 6 or more **20% of the time**. So in a class of 15 pairs, expect about 6 pairs to think the attacker is at least even, and 3 to think the attacker is ahead.
- **How close should the class total be?** A rough 95% range is ± 1/√(battles): 150 battles give about ± 8 points, 300 give about ± 6. That's why the talk runs 10,000 (± 1 point).

## Debrief questions

- Why did most of us predict 50%? What did we forget? *(The ties, one in six rolls.)*
- Which pair would you trust to balance a game? *(None alone. The pooled number, and even that only roughly.)*
- How many battles would we need to tell 42% from 45%? *(Thousands. Ask the Lab's "How many runs?" line: a 3-point edge needs about 1,000 battles before the ± is smaller than the edge.)*
- What did rolling real dice tell us that the computer can't? *(How it feels: ties were frustrating for attackers, a streak felt like a pattern.)*

## Variations

- **Three dice against two** (the talk's Dice Duel): each player needs more dice and reading pairs takes longer, so allow 5 minutes. Attacker sweeps 37%, split 34%, defender sweeps 29%.
- **Two against two:** the defender sweeps twice as often as the attacker (45% against 23%). A good surprise for a class that has seen 3 against 2.
- **Ten playtests:** skip the pooling and ask each pair to write a one-line balance report from its 10 battles. Then show the Ten Playtests chapter (`?set=playtests`).
