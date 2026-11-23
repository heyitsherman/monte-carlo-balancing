/** SVG die faces with pips. */

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};

/** Die colours: P1 Cobalt, P2 Mustard. Pips use the colour's own text-on-fill ink (AA in both themes). */
export type DieTone = 'p1' | 'p2';

/** One die face. Dice keep their rounded corners and round pips (game pieces keep their real shapes). */
export function dieSvg(value: number, size: number, tone: DieTone, extraClass = ''): string {
  const pips = PIPS[value] ?? [];
  const r = size * 0.085;
  const dots = pips.map(([px, py]) => `<circle cx="${px * size}" cy="${py * size}" r="${r}" class="pip"/>`).join('');
  return `<svg class="die die--${tone} ${extraClass}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="die showing ${value}">
    <rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="${size * 0.16}" class="die-body"/>${dots}</svg>`;
}
