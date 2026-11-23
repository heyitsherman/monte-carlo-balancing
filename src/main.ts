// Design system first (generated from the heyitsherman-web skill; never edit src/hih/), then the app.
import './fonts.css';
import './hih/tokens.css';
import './hih/hih-web.css';
import './styles.css';
import { runner } from './core/runner';
import { ClosingChapter, TitleChapter } from './ui/chapters/bookends';
import { BestOfChapter } from './ui/chapters/bestOf';
import { DiceDuelChapter } from './ui/chapters/diceDuel';
import { LootChapter } from './ui/chapters/loot';
import { LuckChapter } from './ui/chapters/luck';
import { PlaytestsChapter } from './ui/chapters/playtests';
import { RaceChapter } from './ui/chapters/race';
import { UnfairChapter } from './ui/chapters/unfair';
import { Lab } from './lab/lab';
import { Presenter } from './ui/presenter';

/** Every chapter available. A session picks from these with `?set=id,id,…`. */
const library = [
  new TitleChapter(),
  new DiceDuelChapter(),
  new RaceChapter(),
  new PlaytestsChapter(),
  new LuckChapter(),
  new LootChapter(),
  new BestOfChapter(),
  new UnfairChapter(),
  new ClosingChapter(),
];

const root = document.getElementById('app')!;
if (new URLSearchParams(location.search).has('lab')) {
  // The student Lab: any game, its rules as controls, A/B comparison and sweeps.
  new Lab(root, runner);
} else {
  new Presenter(root, library, runner, {
    // The 5-minute talk, shown when the URL has no ?set=
    defaultSet: ['title', 'duel', 'race', 'closing'],
  });
}
