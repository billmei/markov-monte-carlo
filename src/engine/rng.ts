/** Deterministic pseudo-random number generation. */

export type Rng = () => number;

/**
 * mulberry32 — small, fast, and good enough for Monte Carlo work here.
 * Returns a function yielding values in [0, 1).
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derives an independent seed for a single run.
 *
 * Each run gets its own generator rather than sharing one stream, so run #500
 * is reproducible on its own and changing the run count never shifts the
 * results of the runs that came before.
 */
export function deriveSeed(seed: number, index: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (index + 0x85ebca6b), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A seed derived from the clock, for the "randomize" button. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
