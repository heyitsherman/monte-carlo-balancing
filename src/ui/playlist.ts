/**
 * Sessions are playlists of chapters, chosen by URL: `?set=duel,race`.
 * Pure functions (no DOM) so they can be unit-tested.
 */

export interface Playlist {
  /** Chapter ids to show, in order. */
  ids: string[];
  /** Requested ids that don't exist (ignored). */
  unknown: string[];
}

/** Read `?set=a,b,c` from a query string. No (valid) set → the default playlist. */
export function parsePlaylist(search: string, libraryIds: readonly string[], defaultIds: readonly string[]): Playlist {
  const raw = new URLSearchParams(search).get('set');
  if (!raw) return { ids: [...defaultIds], unknown: [] };
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const part of raw.split(',')) {
    const id = part.trim().toLowerCase();
    if (!id || ids.includes(id)) continue;
    if (libraryIds.includes(id)) ids.push(id);
    else unknown.push(id);
  }
  return { ids: ids.length ? ids : [...defaultIds], unknown };
}

export interface HashTarget {
  /** Index into the playlist. */
  chapter: number;
  /** 0-based step. */
  step: number;
}

/**
 * Deep links: `#race.4` (chapter id, stable across playlists) or `#3.4` (position in the
 * current playlist), step 1-based and optional. Out-of-range numbers are clamped.
 * Returns null when the hash is not a deep link or names a chapter outside the playlist.
 */
export function parseHash(hash: string, playlistIds: readonly string[], stepCounts: readonly number[]): HashTarget | null {
  const m = /^#([a-z][a-z0-9-]*|\d+)(?:\.(\d+))?$/i.exec(hash);
  if (!m || playlistIds.length === 0) return null;
  let chapter: number;
  if (/^\d+$/.test(m[1])) {
    chapter = Math.min(playlistIds.length, Math.max(1, Number(m[1]))) - 1;
  } else {
    chapter = playlistIds.indexOf(m[1].toLowerCase());
    if (chapter < 0) return null;
  }
  const step = Math.min(stepCounts[chapter], Math.max(1, Number(m[2] ?? 1))) - 1;
  return { chapter, step };
}

/** Link to a session with these chapters, e.g. `…/?set=duel,race`. */
export function playlistUrl(base: string, ids: readonly string[]): string {
  return `${base}?set=${ids.join(',')}`;
}
