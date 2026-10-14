import './styles.css';
import { runner } from './core/runner';
import { ClosingChapter, TitleChapter } from './ui/chapters/bookends';
import { DiceDuelChapter } from './ui/chapters/diceDuel';
import { RaceChapter } from './ui/chapters/race';
import { Presenter } from './ui/presenter';

const root = document.getElementById('app')!;
new Presenter(root, [new TitleChapter(), new DiceDuelChapter(), new RaceChapter(), new ClosingChapter()], runner);
