/**
 * Seeded PRNG: sfc32 (Small Fast Counting, 32-bit), seeded through cyrb128.
 * Same seed → same sequence, on every machine and every rehearsal.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

export type Seed = string | number;

/** cyrb128: hashes a string into four 32-bit words for sfc32's state. */
export function hashSeed(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function createRng(seed: Seed): Rng {
  let [a, b, c, d] = hashSeed(String(seed));
  const nextU32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Warm up: discard the first outputs so similar seeds diverge.
  for (let i = 0; i < 15; i++) nextU32();
  const next = (): number => nextU32() / 4294967296;
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
  };
}

/** A short, human-readable random seed for the `S` (reseed) key. */
export function randomSeed(): string {
  const words = ['amber', 'basalt', 'cobalt', 'delta', 'ember', 'fjord', 'garnet', 'harbor',
    'indigo', 'juniper', 'kestrel', 'lumen', 'maple', 'nimbus', 'onyx', 'pylon',
    'quartz', 'raven', 'sable', 'tundra', 'umber', 'vertex', 'willow', 'zephyr'];
  const w = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${w}-${num}`;
}
