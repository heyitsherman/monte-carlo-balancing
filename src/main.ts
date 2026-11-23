// Design system first (generated from the heyitsherman-web skill; never edit src/hih/), then the app.
import './fonts.css';
import './hih/tokens.css';
import './hih/hih-web.css';
import './styles.css';
import { runner } from './core/runner';
import { ClosingChapter, TitleChapter } from './ui/chapters/bookends';
import { DiceDuelChapter } from './ui/chapters/diceDuel';
import { RaceChapter } from './ui/chapters/race';
import { Presenter } from './ui/presenter';

/** Every chapter available. A session picks from these with `?set=id,id,…`. */
const library = [new TitleChapter(), new DiceDuelChapter(), new RaceChapter(), new ClosingChapter()];

const root = document.getElementById('app')!;
new Presenter(root, library, runner, {
  // The 5-minute talk, shown when the URL has no ?set=
  defaultSet: ['title', 'duel', 'race', 'closing'],
});
