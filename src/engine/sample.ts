import type { Rng } from "./rng";

/** A weighted choice: an id paired with a non-negative relative weight. */
export interface WeightedEntry {
  id: string;
  weight: number;
}

/**
 * Scales weights so they sum to 1. Negative weights are clamped to 0.
 * An all-zero (or empty) input yields a uniform distribution, which keeps the
 * UI usable while someone is mid-edit and has dragged every slider to zero.
 */
export function normalizeEntries(entries: WeightedEntry[]): WeightedEntry[] {
  if (entries.length === 0) return [];
  const clamped = entries.map((e) => ({
    id: e.id,
    weight: Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 0,
  }));
  const total = clamped.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) {
    const uniform = 1 / clamped.length;
    return clamped.map((e) => ({ id: e.id, weight: uniform }));
  }
  return clamped.map((e) => ({ id: e.id, weight: e.weight / total }));
}

/** Convenience wrapper for the `Record<string, number>` shape used in JSON. */
export function normalizeRecord(record: Record<string, number>): WeightedEntry[] {
  return normalizeEntries(
    Object.entries(record).map(([id, weight]) => ({ id, weight })),
  );
}

/**
 * Draws one entry. Expects already-normalized weights; the final entry absorbs
 * any floating-point shortfall so this never falls through.
 */
export function sampleEntry(normalized: WeightedEntry[], rng: Rng): WeightedEntry {
  const last = normalized[normalized.length - 1];
  if (last === undefined) {
    throw new Error("sampleEntry: cannot sample from an empty distribution");
  }
  const roll = rng();
  let cumulative = 0;
  for (const entry of normalized) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry;
  }
  return last;
}

/** Uniform draw from a closed interval; tolerates a reversed range. */
export function sampleRange(range: readonly [number, number], rng: Rng): number {
  const [a, b] = range;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return lo + rng() * (hi - lo);
}
