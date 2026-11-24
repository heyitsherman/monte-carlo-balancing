import { describe, expect, test } from 'vitest';
import { decodeLab, encodeLab } from '../src/lab/labState';

/**
 * The teaching kit (docs/teaching) links straight into the Lab. If a game's setting is renamed or a
 * value falls out of range, the link would silently open different rules from the ones the answer key
 * describes. Every link must decode and encode back to itself.
 */
const docs = import.meta.glob<string>('../docs/teaching/*.md', { query: '?raw', import: 'default', eager: true });
const LINK = /https:\/\/heyitsherman\.github\.io\/monte-carlo-balancing\/\?(lab[^\s)]*)/g;

const links = Object.entries(docs).flatMap(([file, text]) =>
  [...text.matchAll(LINK)].map((m) => ({ file: file.split('/').pop() ?? file, query: m[1] })),
);

describe('teaching kit Lab links', () => {
  test('the kit has Lab links to check', () => {
    expect(links.length).toBeGreaterThan(15);
  });

  for (const { file, query } of links) {
    if (query === 'lab') continue;
    test(`${file}: ?${query}`, () => {
      expect(encodeLab(decodeLab(query))).toBe(query);
    });
  }
});
