import { isCancelled } from '../../core/runner';
import { createRng } from '../../core/rng';
import { BOSS_TARGET, FAIR_TARGET, HANDICAP_TARGET, type Target } from '../../core/stats';
import { boss, fightBoss, type BossAggregate, type BossConfig, type BossExact, type RoundEvent } from '../../games/boss';
import { race, type RaceAggregate, type RaceConfig, type RaceExact } from '../../games/race';
import { sound } from '../audio';
import { dieSvg } from '../charts/dice';
import { MatchPanel, matchPromptVariants } from '../match';
import type { AppContext, Chapter, EnterInfo, StepDef } from '../types';
import { el } from '../util';

const BOSS: BossConfig = boss.defaultConfig;
const RACE: RaceConfig = race.defaultConfig;
const FIGHTS = { one: 'fight', many: 'fights' };
const GAMES = { one: 'game', many: 'games' };
const BOSS_HP = { min: 20, max: 40 };

const FAIR_FIGHT: Target = { ...FAIR_TARGET, labels: { below: 'Favors the boss', on: 'Fair', above: 'Favors you' } };
const HANDICAP_NOTE = (h: number) =>
  `On target with a ${h}-square head start: the head start that was “too far” when the goal was fair.`;

const QUESTIONS: [string, string][] = [
  ['House edge', 'A casino game has to favor the house. How big can the edge get before players feel cheated?'],
  ['Roguelike runs', 'What share of runs should reach the final boss? 5%? 30%? What changes if it is 60%?'],
  ['Snowballing', 'Should the leader get stronger as they win? How much room for a comeback should stay?'],
];

/** Chapter: intentional unfairness. Tune toward a target that isn't 50%. */
export class UnfairChapter implements Chapter {
  id = 'unfair';
  title = 'Fair Isn’t the Goal';
  minutes = 2.5;
  showsStats = true;
  steps: StepDef[] = [
    {
      caption: 'A boss fight. Should it be fair?',
      sub: `You have ${BOSS.heroHp} HP, the boss has ${BOSS.bossHp}. Each round you hit for a d6, then the boss hits back for a d6.`,
    },
    {
      caption: 'Fair: the boss beats half the players.',
      sub: 'Would you ship a boss that sends half your players back to the start?',
      activity: true,
      subVariants: matchPromptVariants(FAIR_FIGHT, 'fair', FIGHTS.many),
    },
    {
      caption: 'Target: 70% of players win on their first try.',
      sub: 'Press − to weaken the boss until the verdict reads On target.',
      subVariants: matchPromptVariants(BOSS_TARGET, 'on target', FIGHTS.many),
    },
    {
      caption: 'A handicap: P2 is the newer player. Aim for P2 winning 58%.',
      sub: 'The race from earlier. Press + to give Player 2 a head start.',
      subVariants: [...matchPromptVariants(HANDICAP_TARGET, 'on target', GAMES.many), HANDICAP_NOTE(3)],
    },
    {
      caption: 'Other games aim away from 50% on purpose.',
      takeaway: 'Pick the target first, then tune toward it. Fair is just one target.',
    },
  ];

  private ctx!: AppContext;
  private step = 0;
  private demoCount = 0;

  labLink() {
    if (this.step === 3) return { game: 'race', config: this.raceCfg };
    return { game: 'boss', config: this.step === 4 ? { ...BOSS, bossHp: 28 } : this.bossCfg };
  }
  private bossCfg: BossConfig = BOSS;
  private raceCfg: RaceConfig = RACE;
  private fightView!: HTMLElement;
  private resultView!: HTMLElement;
  private talkView!: HTMLElement;
  private controls!: HTMLElement;
  private fairPanel!: MatchPanel<BossAggregate>;
  private targetPanel!: MatchPanel<BossAggregate>;
  private handicapPanel!: MatchPanel<RaceAggregate>;

  mount(stage: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    stage.classList.add('ch-unfair');
    this.fightView = el('div', { class: 'view fight-view' });
    this.resultView = el('div', { class: 'view result-view' });
    this.talkView = el('div', { class: 'view talk-view' });
    stage.append(this.fightView, this.resultView, this.talkView);

    this.controls = el('div', { class: 'controls' });
    this.controls.innerHTML = `
      <label class="ctl" data-ctl="boss">
        <span class="ctl-name">Boss HP</span>
        <input type="range" min="${BOSS_HP.min}" max="${BOSS_HP.max}" step="1" value="${BOSS.bossHp}" aria-label="Boss health points">
        <output class="ctl-val">${BOSS.bossHp}</output><span class="ctl-unit">HP</span>
      </label>
      <label class="ctl" data-ctl="headStart">
        <span class="ctl-name">P2 head start</span>
        <input type="range" min="0" max="6" step="1" value="0" aria-label="Player 2 head start in squares">
        <output class="ctl-val">0</output><span class="ctl-unit">squares</span>
      </label>
      <div class="rules-chip"></div>`;
    const bossInput = this.controls.querySelector<HTMLInputElement>('[data-ctl=boss] input')!;
    const hsInput = this.controls.querySelector<HTMLInputElement>('[data-ctl=headStart] input')!;
    bossInput.addEventListener('input', () => this.setBossHp(Number(bossInput.value)));
    hsInput.addEventListener('input', () => this.setHeadStart(Number(hsInput.value)));
    for (const i of [bossInput, hsInput]) i.addEventListener('change', () => i.blur());

    const bossSides = {
      gameId: boss.id,
      left: { name: 'You', tone: 'p1' as const },
      right: { name: 'Boss', tone: 'p2' as const },
      leftWins: (a: BossAggregate) => a.heroWins,
      runs: (a: BossAggregate) => a.n,
      leftExact: (e: unknown) => (e as BossExact).heroWin,
      measure: 'left' as const,
      noun: FIGHTS,
    };
    this.fairPanel = new MatchPanel<BossAggregate>(ctx, { ...bossSides, target: FAIR_FIGHT, onWord: 'fair' });
    this.targetPanel = new MatchPanel<BossAggregate>(ctx, {
      ...bossSides,
      target: BOSS_TARGET,
      onWord: 'on target',
      bandText: 'On target: you win 67–73%',
    });
    this.handicapPanel = new MatchPanel<RaceAggregate>(ctx, {
      gameId: race.id,
      left: { name: 'P1', tone: 'p1' },
      right: { name: 'P2', tone: 'p2' },
      leftWins: (a) => a.p1Wins,
      runs: (a) => a.n,
      leftExact: (e) => (e ? (e as RaceExact).p1Win : NaN),
      measure: 'right',
      target: HANDICAP_TARGET,
      onWord: 'on target',
      noun: GAMES,
      bandText: 'On target: P2 wins 55–61%',
      settledNote: (a) => (a.status === 'on' ? HANDICAP_NOTE(this.raceCfg.p2HeadStart) : null),
    });
    this.resultView.append(this.controls, this.fairPanel.el, this.targetPanel.el, this.handicapPanel.el);

    this.talkView.innerHTML = `<ul class="lanes talk-lanes">${QUESTIONS.map(
      ([h, q]) => `<li class="lane"><h3 class="lane__head">${h}</h3><p>${q}</p></li>`,
    ).join('')}</ul>`;
  }

  reseed(): void {
    this.demoCount = 0;
    for (const p of [this.fairPanel, this.targetPanel]) p.reseed();
    this.handicapPanel.reseed();
  }

  private get panels() {
    return [this.fairPanel, this.targetPanel, this.handicapPanel] as const;
  }

  enter(step: number, info: EnterInfo): void {
    this.step = step;
    for (const p of this.panels) p.stop();
    this.fightView.hidden = step !== 0;
    this.resultView.hidden = step < 1 || step > 3;
    this.talkView.hidden = step !== 4;
    this.fairPanel.el.hidden = step !== 1;
    this.targetPanel.el.hidden = step !== 2;
    this.handicapPanel.el.hidden = step !== 3;
    const rerun = info.direction === 'rerun';
    // Each step starts from its own rules, but a re-run keeps the presenter's slider.
    if (!(step === 2 && rerun)) this.bossCfg = BOSS;
    if (!(step === 3 && rerun)) this.raceCfg = RACE;
    this.sync();
    const audible = info.direction !== 'backward';
    const go = async () => {
      if (step === 0) {
        if (rerun) this.demoCount++;
        await this.playFight(info.animate, audible);
      } else if (step === 1) {
        await this.fairPanel.show(BOSS, { animate: info.animate, audible });
      } else if (step === 2) {
        await this.targetPanel.show(this.bossCfg, { animate: info.animate, audible, ghost: BOSS });
      } else if (step === 3) {
        await this.handicapPanel.show(this.raceCfg, { animate: info.animate, audible, ghost: RACE });
      } else if (audible) {
        sound.verdict();
      }
    };
    go().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  adjust(delta: number): void {
    if (this.step === 2) this.setBossHp(this.bossCfg.bossHp + delta);
    else if (this.step === 3) this.setHeadStart(this.raceCfg.p2HeadStart + delta);
  }

  onKey(key: string): boolean {
    if (this.step === 1) return this.fairPanel.onKey(key);
    if (this.step === 2) return this.targetPanel.onKey(key);
    if (this.step === 3) return this.handicapPanel.onKey(key);
    return false;
  }

  private setBossHp(v: number): void {
    const hp = Math.max(BOSS_HP.min, Math.min(BOSS_HP.max, v));
    if (hp === this.bossCfg.bossHp) return;
    this.bossCfg = { ...this.bossCfg, bossHp: hp };
    this.sync();
    this.targetPanel.show(this.bossCfg, { animate: false, audible: true, ghost: BOSS }).catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  private setHeadStart(v: number): void {
    const h = Math.max(0, Math.min(6, v));
    if (h === this.raceCfg.p2HeadStart) return;
    this.raceCfg = { ...this.raceCfg, p2HeadStart: h };
    this.sync();
    this.handicapPanel.show(this.raceCfg, { animate: false, audible: true, ghost: RACE }).catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  private sync(): void {
    const show = { boss: this.step === 2, headStart: this.step === 3 };
    for (const c of this.controls.querySelectorAll<HTMLElement>('.ctl')) c.hidden = !show[c.dataset.ctl as keyof typeof show];
    const set = (ctl: string, v: number) => {
      this.controls.querySelector<HTMLInputElement>(`[data-ctl=${ctl}] input`)!.value = String(v);
      this.controls.querySelector(`[data-ctl=${ctl}] output`)!.textContent = String(v);
    };
    set('boss', this.bossCfg.bossHp);
    set('headStart', this.raceCfg.p2HeadStart);
    const chip = this.controls.querySelector('.rules-chip')!;
    chip.textContent =
      this.step === 3
        ? `Rules: the race, ${RACE.trackLength} squares · P2 head start ${this.raceCfg.p2HeadStart}`
        : `Rules: you ${this.bossCfg.heroHp} HP, d6 · boss ${this.bossCfg.bossHp} HP, d6`;
  }

  // ---- step 1: one fight, round by round ------------------------------------------------------

  private async playFight(animate: boolean, audible: boolean): Promise<void> {
    const epoch = this.ctx.epoch;
    const events: RoundEvent[] = [];
    const outcome = fightBoss(BOSS, createRng(`${this.ctx.seed}|boss-demo|${this.demoCount}`), (e) => events.push(e));
    const meter = (who: 'hero' | 'boss', name: string, tone: 'p1' | 'p2', max: number) => `
      <div class="hp-row" data-who="${who}">
        <span class="hp-name"><span class="who who--${tone}">${name}</span></span>
        <div class="hp-bar" role="img" aria-label="${name} health"><div class="hp-fill hp-fill--${tone}" style="width:100%"></div></div>
        <span class="hp-num">${max} / ${max} HP</span>
      </div>`;
    this.fightView.innerHTML = `
      <div class="fight">${meter('hero', 'You', 'p1', BOSS.heroHp)}${meter('boss', 'Boss', 'p2', BOSS.bossHp)}</div>
      <div class="turn-info"><div class="turn-dice"></div><div class="turn-text">You strike first.</div></div>
      <div class="hint">Press R to fight again.</div>`;
    const set = (who: 'hero' | 'boss', hp: number, max: number) => {
      const row = this.fightView.querySelector<HTMLElement>(`.hp-row[data-who=${who}]`)!;
      row.querySelector<HTMLElement>('.hp-fill')!.style.width = `${(hp / max) * 100}%`;
      row.querySelector('.hp-num')!.textContent = `${hp} / ${max} HP`;
    };
    const diceEl = this.fightView.querySelector<HTMLElement>('.turn-dice')!;
    const textEl = this.fightView.querySelector<HTMLElement>('.turn-text')!;
    const roundMs = animate ? 900 : 300;
    if (!(await this.ctx.wait(animate ? 500 : 120, epoch))) return;
    for (const ev of events) {
      diceEl.innerHTML = dieSvg(ev.heroHit, 60, 'p1') + (ev.bossHit ? dieSvg(ev.bossHit, 60, 'p2') : '');
      textEl.innerHTML = ev.bossHit
        ? `Round ${ev.round}: you hit for ${ev.heroHit}, the boss hits back for ${ev.bossHit}.`
        : `Round ${ev.round}: you hit for ${ev.heroHit}.`;
      set('hero', ev.heroHp, BOSS.heroHp);
      set('boss', ev.bossHp, BOSS.bossHp);
      if (audible) sound.dice();
      if (!(await this.ctx.wait(roundMs, epoch))) return;
    }
    textEl.innerHTML = outcome.heroWins
      ? `<b>You win</b> with ${outcome.heroHpLeft} HP left!`
      : `<b>The boss wins.</b> Back to the start.`;
    if (audible) sound.verdict();
  }
}
