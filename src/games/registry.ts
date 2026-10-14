import { diceDuel } from './diceDuel';
import { race } from './race';
import type { AnyGame } from './types';

/** All simulatable games, by id. Adding a game = one file + one line here. */
export const games = {
  diceDuel,
  race,
} satisfies Record<string, AnyGame>;

export type GameId = keyof typeof games;

export function getGame(id: string): AnyGame {
  const g = (games as Record<string, AnyGame>)[id];
  if (!g) throw new Error(`Unknown game: ${id}`);
  return g;
}
