/**
 * Renormalization for the probability editors.
 *
 * Editing one branch of a distribution has to do something with the others, and
 * the useful behaviour is: hold the edited value exactly, hold anything the
 * user locked, and spread whatever is left over the rest in proportion to what
 * they already were. That way nudging a 60/30/10 split preserves the 3:1 ratio
 * between the two untouched branches instead of flattening them.
 *
 * Values are percentages summing to 100 — the UI's unit, not the engine's. The
 * engine normalizes whatever it is handed, so this is presentation logic, but
 * keeping it exact means the editor's "sums to 100.0" readout is honest.
 */

export interface RedistributeInput {
  /** Current values, keyed by id, in percent. */
  values: Record<string, number>;
  /** The id being edited. */
  changedId: string;
  /** Its requested new value, in percent. */
  nextValue: number;
  /** Ids held fixed by the user. */
  locked?: ReadonlySet<string>;
}

const TOTAL = 100;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function redistribute({
  values,
  changedId,
  nextValue,
  locked = new Set<string>(),
}: RedistributeInput): Record<string, number> {
  const ids = Object.keys(values);
  if (ids.length === 0) return {};
  if (ids.length === 1) return { [ids[0]!]: TOTAL };

  const lockedIds = ids.filter((id) => id !== changedId && locked.has(id));
  const freeIds = ids.filter((id) => id !== changedId && !locked.has(id));

  const lockedTotal = lockedIds.reduce((sum, id) => sum + (values[id] ?? 0), 0);

  // Everything is pinned except the edited row, so it absorbs the remainder.
  if (freeIds.length === 0) {
    const result: Record<string, number> = {};
    for (const id of lockedIds) result[id] = values[id] ?? 0;
    result[changedId] = round(clamp(TOTAL - lockedTotal, 0, TOTAL));
    return result;
  }

  const headroom = clamp(TOTAL - lockedTotal, 0, TOTAL);
  const changed = clamp(nextValue, 0, headroom);
  const remaining = headroom - changed;

  const freeTotal = freeIds.reduce((sum, id) => sum + (values[id] ?? 0), 0);

  const result: Record<string, number> = { [changedId]: changed };
  for (const id of lockedIds) result[id] = values[id] ?? 0;

  if (freeTotal > 0) {
    for (const id of freeIds) {
      result[id] = remaining * ((values[id] ?? 0) / freeTotal);
    }
  } else {
    // Nothing to hold a ratio against — split the remainder evenly.
    const share = remaining / freeIds.length;
    for (const id of freeIds) result[id] = share;
  }

  return roundToTotal(result, ids);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Rounds to one decimal while keeping the total at exactly 100, so the editor
 * never displays a set of values that visibly fails to add up.
 */
function roundToTotal(
  values: Record<string, number>,
  order: string[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const id of order) result[id] = round(values[id] ?? 0);

  const total = order.reduce((sum, id) => sum + (result[id] ?? 0), 0);
  const drift = round(TOTAL - total);
  if (drift === 0) return result;

  // Push the rounding residue onto the largest entry, where it is least visible.
  const target = order.reduce((best, id) =>
    (result[id] ?? 0) > (result[best] ?? 0) ? id : best,
  );
  result[target] = round(clamp((result[target] ?? 0) + drift, 0, TOTAL));
  return result;
}

/** Converts engine weights to percentages summing to 100. */
export function toPercentages(weights: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weights);
  const total = ids.reduce((sum, id) => sum + Math.max(0, weights[id] ?? 0), 0);
  if (total <= 0) {
    const share = ids.length > 0 ? TOTAL / ids.length : 0;
    return Object.fromEntries(ids.map((id) => [id, round(share)]));
  }
  return roundToTotal(
    Object.fromEntries(
      ids.map((id) => [id, (Math.max(0, weights[id] ?? 0) / total) * TOTAL]),
    ),
    ids,
  );
}

/** Converts editor percentages back to engine weights in 0–1. */
export function toWeights(percentages: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(percentages).map(([id, value]) => [id, value / TOTAL]),
  );
}
