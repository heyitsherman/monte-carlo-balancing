import { runRng } from '../../core/engine';
import { isCancelled } from '../../core/runner';
import { formatInt, wilson } from '../../core/stats';
import { race, type RaceAggregate, type RaceConfig } from '../../games/race';
import type { AppContext, Chapter, EnterInfo, StepDef } from '../types';
import { sound } from '../audio';
import { playBuildUp } from '../buildUp';
import { el, fx } from '../util';

const BASE: RaceConfig = race.defaultConfig;
const GROUPS = 20;
const PER_GROUP = 10;
const N = 10_000;

export type GroupCall = 'p1' | 'tie' | 'p2';

export interface PlaytestGroup {
  /** Winner of each game, in order. */
  winners: (1 | 2)[];
  p1Wins: number;
  call: GroupCall;
}

/** What a group concludes from its own games: whoever won more has the edge; a tie looks fair. */
export function groupCall(p1Wins: number, games: number): GroupCall {
  return p1Wins * 2 > games ? 'p1' : p1Wins * 2 === games ? 'tie' : 'p2';
}

/**
 * The groups' games: the first `groups × perGroup` games of the race's own run stream for this seed,
 * so they are literally the first games of the 10,000 the race chapter plays.
 */
export function playtestGroups(seed: string, groups = GROUPS, perGroup = PER_GROUP): PlaytestGroup[] {
  const rng = runRng(seed, race.id, BASE);
  return Array.from({ length: groups }, () => {
    const winners = Array.from({ length: perGroup }, () => race.simulate(BASE, rng).winner);
    const p1Wins = winners.filter((w) => w === 1).length;
    return { winners, p1Wins, call: groupCall(p1Wins, perGroup) };
  });
}

const CALL_LABEL: Record<GroupCall, string> = { p1: 'P1 ahead', tie: 'Looks fair', p2: 'P2 ahead' };

/** Chapter: twenty groups of ten playtests each, against the truth from 10,000 runs. */
export class PlaytestsChapter implements Chapter {
  id = 'playtests';
  title = 'Ten Playtests Prove Nothing';
  minutes = 1.5;
  showsStats = true;
  steps: StepDef[] = [
    {
      caption: 'Twenty groups each playtest the race 10 times.',
      sub: `The same race: ${BASE.trackLength} squares, one d6, Player 1 moves first.`,
    },
    {
      caption: 'What would each group conclude?',
      sub: 'More wins means “that player has the edge”. A 5–5 split looks fair.',
    },
    {
      caption: 'Now the same race, 10,000 times.',
      takeaway: 'Ten playtests tell you how a game feels, not what its odds are.',
    },
  ];

  private ctx!: AppContext;
  private grid!: HTMLElement;

  labLink() {
    return { game: 'race', config: BASE };
  }
  private truth!: HTMLElement;

  mount(stage: HTMLElement, ctx: AppContext): void {
    this.ctx = ctx;
    stage.classList.add('ch-playtests');
    const view = el('div', { class: 'view playtests-view' });
    this.grid = el('div', { class: 'pt-grid' });
    this.truth = el('div', { class: 'pt-truth' });
    view.append(this.grid, this.truth);
    stage.append(view);
  }

  enter(step: number, info: EnterInfo): void {
    const run = async () => {
      const groups = playtestGroups(this.ctx.seed);
      const epoch = this.ctx.epoch;
      // The truth row always holds its space (hidden until the last step), so nothing moves.
      this.truth.style.visibility = step === 2 ? '' : 'hidden';
      this.renderTruth(groups);
      if (step === 0) {
        if (info.animate) {
          const frames = [1, 2, 5, 10, GROUPS].map((n) => ({ n, data: n }));
          await playBuildUp(this.ctx, epoch, frames, (n) => this.renderGrid(groups, n, step), {
            noun: { one: 'group', many: 'groups' },
            holdMs: 700,
          });
        } else this.renderGrid(groups, GROUPS, step);
        return;
      }
      this.renderGrid(groups, GROUPS, step);
      if (step === 2) {
        const agg = await this.ctx.runner.run<RaceAggregate>('race', BASE, N, this.ctx.seed);
        if (!this.ctx.alive(epoch)) return;
        this.renderTruth(groups, agg);
      }
      if (info.direction !== 'backward') sound.verdict();
    };
    run().catch((e) => {
      if (!isCancelled(e)) console.error(e);
    });
  }

  /** The first `shown` groups as cards; the rest keep their places as empty outlines. */
  private renderGrid(groups: PlaytestGroup[], shown: number, step: number): void {
    this.grid.innerHTML = groups
      .map((g, i) => {
        if (i >= shown) return `<div class="pt-card is-empty" aria-hidden="true"></div>`;
        const dots = g.winners.map((w) => `<span class="pt-dot pt-dot--p${w}"></span>`).join('');
        const wrong = g.call !== 'p1';
        const state = step === 2 ? (wrong ? ' is-wrong' : ' is-dim') : '';
        return `<div class="pt-card${state}">
          <div class="pt-head"><span class="pt-name">Group ${i + 1}</span><span class="pt-score">${g.p1Wins}–${PER_GROUP - g.p1Wins}</span></div>
          <div class="pt-dots" role="img" aria-label="Player 1 won ${g.p1Wins} of ${PER_GROUP}">${dots}</div>
          <div class="pt-call"${step === 0 ? ' style="visibility:hidden"' : ''}><span class="pt-tag pt-tag--${g.call}">${CALL_LABEL[g.call]}</span></div>
        </div>`;
      })
      .join('');
  }

  /** The real win rate (placeholders until the run is back) and how many groups got it wrong. */
  private renderTruth(groups: PlaytestGroup[], agg?: RaceAggregate): void {
    const w = agg ? wilson(agg.p1Wins, agg.n) : undefined;
    const wrong = groups.filter((g) => g.call !== 'p1').length;
    this.truth.innerHTML = `
      <div class="pt-stat"><span class="pt-big">${w ? `${fx(w.p * 100)}%` : '…'}</span><span class="pt-label">Player 1’s real win rate (± ${w ? fx(w.marginPP) : '…'} pp, ${formatInt(N)} games)</span></div>
      <div class="pt-stat"><span class="pt-big">${wrong} of ${GROUPS}</span><span class="pt-label">groups called it fair, or said Player 2 has the edge</span></div>`;
  }
}
