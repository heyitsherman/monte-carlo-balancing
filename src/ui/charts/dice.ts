/** SVG die faces with pips. */

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};

/** One die face. `color` fills the die; pips are drawn in the die's contrasting ink. */
export function dieSvg(value: number, size: number, color: string, extraClass = ''): string {
  const pips = PIPS[value] ?? [];
  const r = size * 0.085;
  const dots = pips.map(([px, py]) => `<circle cx="${px * size}" cy="${py * size}" r="${r}" class="pip"/>`).join('');
  return `<svg class="die ${extraClass}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="die showing ${value}">
    <rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="${size * 0.16}" fill="${color}" class="die-body"/>${dots}</svg>`;
}
