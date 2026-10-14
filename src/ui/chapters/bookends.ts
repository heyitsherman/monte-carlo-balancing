import { dieSvg } from '../charts/dice';
import type { Chapter } from '../types';

/** Chapter 0 — title / framing. */
export class TitleChapter implements Chapter {
  id = 'title';
  title = 'Title';
  steps = [{ caption: '' }];

  mount(stage: HTMLElement): void {
    stage.classList.add('ch-title');
    stage.innerHTML = `
      <div class="title-card">
        <div class="title-dice" aria-hidden="true">
          ${dieSvg(6, 84, 'var(--p1)')}${dieSvg(3, 84, 'var(--p2)')}${dieSvg(5, 84, 'var(--p1)')}
        </div>
        <h1>Run it 10,000 times</h1>
        <p class="subtitle">Monte Carlo simulation for game balancing</p>
        <p class="core">Probability tells you what <em>should</em> happen.<br>
        Simulation tells you what <em>does</em> happen — by playing the game thousands of times.</p>
        <p class="hint">Press → or Space to begin · Esc for keys</p>
      </div>`;
  }

  enter(): void {}
}

/** Chapter 3 — closing. */
export class ClosingChapter implements Chapter {
  id = 'closing';
  title = 'Closing';
  steps = [{ caption: 'Three things to take home.' }];

  mount(stage: HTMLElement): void {
    stage.classList.add('ch-closing');
    stage.innerHTML = `
      <ol class="takeaways">
        <li><b>Run it thousands of times.</b> 10 playtests prove nothing about a 5% edge.</li>
        <li><b>Change one thing, re-run, compare.</b></li>
        <li><b>The simulation only knows what its players know.</b> Playtest anyway.</li>
      </ol>`;
  }

  enter(): void {}
}
