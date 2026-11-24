import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { decodeLab, encodeLab } from '../src/lab/labState';

/**
 * The teaching kit (docs/teaching) links straight into the Lab. If a game's setting is renamed or a
 * value falls out of range, the link would silently open different rules from the ones the answer key
 * describes. Every link must decode and encode back to itself.
 */
const DIR = join(__dirname, '..', 'docs', 'teaching');
const LINK = /https:\/\/heyitsherman\.github\.io\/monte-carlo-balancing\/\?(lab[^\s)]*)/g;

const links = readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .flatMap((f) => [...readFileSync(join(DIR, f), 'utf8').matchAll(LINK)].map((m) => ({ file: f, query: m[1] })));

describe('teaching kit Lab links', () => {
  test('the kit has Lab links to check', () => {
    expect(links.length).toBeGreaterThan(15);
  });

  test.each(links.filter((l) => l.query !== 'lab'))('$file: ?$query', ({ query }) => {
    expect(encodeLab(decodeLab(query))).toBe(query);
  });
});
