# Exercises

Each exercise opens the Lab with its rules already set: click the link, then follow the task. Record your work on the [worksheet](worksheet.md).

- **Explore:** predict, run, explain why you were right or wrong.
- **Tune:** change the rules until the game hits a target someone else chose.
- **Design:** choose your own target, defend it, then find rules that hit it.

**Reading the Lab.** Every result comes with a likely range (the ±). A verdict like "Fair" or "On target" means the whole range sits inside the target band. "Not enough data: run more" means the range crosses the band's edge: press **N** to run 10 times more. Keep the seed and the number of runs as they are unless the task says otherwise, so your numbers match your classmates'.

---

## Explore

### E1. One die each

The attacker and the defender each roll one die. Higher wins; **ties go to the defender**.

1. Predict: out of 100 battles, how many does the attacker win?
2. Run it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=diceDuel&a.attackerDice=1&a.defenderDice=1
3. Explain the gap between your guess and the result.
4. Try **2 dice against 2** with the presets. Who gains most from the tie rule now?

### E2. Who goes first?

Two players race to square 20, each rolling one die per turn. Player 1 always moves first.

1. Predict: out of 100 games, how many does Player 1 win?
2. Run it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=race
3. Why does moving first matter so much in such a simple game?
4. Click **Average game length** in the table. Does a longer track help or hurt Player 1? Predict, then change the track length and check.

### E3. A 5% drop

A rare sword drops 5% of the time. Each player keeps trying until they get it.

1. Predict three numbers: the average number of tries, the number of tries by which half the players have it, and the tries the unluckiest 1 player in 100 needs.
2. Run it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=loot
3. Which of the three numbers would a player complain about? Which one would a designer usually quote?

### E4. Best of 7

The stronger player wins 55% of single games.

1. Predict: how often does the stronger player win a best-of-7 series?
2. Run it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=bestOf
3. Click **Upsets** in the table. How often does the weaker player take the series? Would that make the format exciting or unfair, and for whom?

### E5. Same rule, or different?

Rules A give Player 2 a 1-square head start. Rules B instead give Player 2 +1 on their first roll.

1. Predict: which helps Player 2 more?
2. Run the comparison: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=race&a.p2HeadStart=1&b&b.p2HeadStart=0&b.p2FirstRollBonus=1
3. Read the **B − A** column. Is the difference real, or too small to tell apart?
4. Explain why the two rules give the same result. (Hint: where is Player 2 after their first move in each case?)

### E6. The first move, with identical bots

In Push your luck, each turn you roll a die as often as you like and add up the numbers; a 1 wipes the turn's points, and banking keeps them. First to 100 wins. Here both bots use the same plan (bank at 20), but bot A always goes first.

1. Predict: what share of games does bot A win?
2. Run it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=pushLuck&a.aHoldAt=20&a.bHoldAt=20&a.firstPlayer=a
3. What does the verdict say? Press **N** to run 100,000 games. Write down the result and range before and after.
4. Is there a first-move edge? Is it big enough that you would change the rules? Defend your answer.

---

## Tune

### T1. Make the race fair

Fair here means Player 1 wins 47–53% of games. Player 2 can get a head start of 0–6 squares.

1. Open the sweep: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=race&view=sweep&x=p2HeadStart
2. Which head start lands in the fair band? Which ones miss, and in which direction?
3. Open your answer in **Results** and check the range sits inside 47–53%.

### T2. Does the fix depend on the die?

Your fair head start was found with a six-sided die. Now the game uses a different die.

1. Predict: with an eight-sided die, does Player 2 need a bigger head start, a smaller one, or the same?
2. Open the two-setting sweep (head start across, die down): https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=race&view=sweep&x=p2HeadStart&y=dieSides
3. For each die, find the head start in the fair band (Teal cells). Is there one for every die?
4. What does this tell you about changing one rule after another has been tuned?

### T3. Keep the average, end the droughts

A 5% drop averages 20 tries but some players wait over 90. Add a pity timer: the sword is guaranteed on try 40. The target is an average of 20 tries ± 1.

1. Run it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=loot&a.pity=40
2. What happened to the average, and why?
3. Change the drop chance until the average is on target again. What chance did you end with?
4. Stretch: set the pity timer to 30 instead. Which drop chance hits the target now?

### T4. Tune the boss

You have 30 HP and hit for a d6 each round; the boss hits back for a d6. The target: **70% of players beat the boss on their first try**, ± 3.

1. Run it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=boss
2. Change **only the boss's HP** until the verdict reads "On target".
3. Reset, then hit the target a second way: change **only the hero's HP**. Then a third way: give the hero a bigger damage die and find a boss HP that fits.
4. Compare your solutions' **Fight length** and **Close wins**. Which fight would feel best?

### T5. How long must a series be?

Target: the stronger player wins at least 75% of series. With a 55% edge per game it takes a best-of-45. What about bigger edges?

1. Open the sweep at a 65% edge: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=bestOf&a.edgePercent=65&view=sweep&x=bestOf
2. The sweep jumps 8 games at a time. Find the two points where the series win rate crosses 75%.
3. Switch to **Results** and step **Best of** between those two points (2 games at a time) to find the shortest series that reaches 75%.
4. Repeat for a 60% and a 70% edge (change **Stronger player wins a game**).
5. What does this mean for a game where players are very close in skill?

### T6. Where should you bank?

In Push your luck, the plan "bank at N" stops rolling once the turn's total reaches N.

1. Open the sweep of bot A's bank threshold, measuring points per turn: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=pushLuck&a.aHoldAt=20&view=sweep&metric=aPerTurn&x=aHoldAt
2. Which threshold scores the most points per turn? Where is the exact answer marked?
3. Stretch: switch bot A to **Roll a fixed number of times**. Which number of rolls scores best? Set up bot A with that plan against bot B banking at 20: who wins?

---

## Design

In every Design exercise, **write your target and why before you touch the rules.** There is no single right answer: you'll be judged on how well your target fits the player you describe, and how well your evidence shows you hit it.

### D1. Your boss

Pick one boss from a game you're designing or would like to (a tutorial boss, a mid-game wall, a final boss, an optional super-boss).

1. Who is the player when they meet it, and what should they feel? Turn that into a target: "__% of players beat it on the first try, give or take __".
2. Tune the boss to your target: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=boss
3. Use **Compare with rules B** to compare your boss with the fair boss (32 HP). What else changed besides the win rate?
4. What can't the simulation tell you about this boss? What would you check in a playtest?

### D2. Fair and exciting

The 2-square head start makes the race fair, but the leader at halfway usually wins. Make the race fair **and** keep comebacks (the winner was behind at halfway) at 35% or more.

1. Start from the comparison (A: head start 2, B: head start 2 plus catch-up): https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=race&a.p2HeadStart=2&b&b.catchUp=1
2. Adjust rules B until both targets are met. Check **P1 wins** and **Comebacks**.
3. Defend your rule set to a player who hates catch-up rules.

### D3. Your loot promise

Decide what your game promises players about a rare drop: an average, and a worst case ("nobody waits more than __ tries").

1. Write the promise and why it suits your game (a free mobile game? a raid? a gacha?).
2. Tune the drop chance and pity timer to keep it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=loot
3. Look at the chart. What share of players hit the pity timer? Is that a problem?

### D4. Your tournament

Choose a series format for one stage of a tournament (group stage, semi-final, grand final) between players who differ by a few points of skill.

1. Decide how often the stronger player *should* win, and why. Think about the players and the audience.
2. Find the series length that gets there: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=bestOf
3. How many games does your format take on average? Is that practical?

### D5. Your handicap

Player 2 is newer at the game. Decide how much help they should get: what share of games should they win?

1. Write your target for P2's win rate, and why (should the newer player win half? less? more?).
2. Find the head start that hits it: https://heyitsherman.github.io/monte-carlo-balancing/?lab&game=race&metric=p2Win
3. The Lab judges **P2 wins** against the *fair* band (47–53%), so its verdict won't match your target. Judge the result and its range against your own band instead.
4. Would you tell the newer player about the handicap? Why or why not?
