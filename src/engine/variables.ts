import type { Rng } from "./rng";
import { normalizeRecord, sampleEntry, sampleRange, type WeightedEntry } from "./sample";
import { STATE_PARENT, type Scenario, type Variable, type VariableDraw } from "./types";

/** Fallback CPT row used when a parent key has no explicit distribution. */
export const CPT_WILDCARD = "*";

/**
 * Resolves the CPT row for a parent key, falling back to the `"*"` row.
 * Returns null when neither exists — the schema check rejects such scenarios,
 * so this only guards against hand-edited state at runtime.
 */
export function cptRow(
  variable: Variable,
  parentKey: string,
): Record<string, number> | null {
  return variable.cpt[parentKey] ?? variable.cpt[CPT_WILDCARD] ?? null;
}

/**
 * Draws every variable for one step, walking the causal chain in declared
 * order so each variable can condition on the one before it.
 *
 * Variables condition on their parent *at the same step*: a variable whose
 * parent is `$state` reads the state the run occupies now, and a variable whose
 * parent is another variable reads the level that variable just drew. This is
 * what lets one implementation serve both chain modes — in `horizon` mode the
 * per-step draws form a time series, and in `absorbing` mode they form one
 * reading per hop along the path.
 */
export function evaluateStep(
  scenario: Scenario,
  stateId: string,
  rng: Rng,
): Record<string, VariableDraw> {
  const draws: Record<string, VariableDraw> = {};

  for (const variable of scenario.variables) {
    const parentKey =
      variable.parent === STATE_PARENT
        ? stateId
        : (draws[variable.parent]?.levelId ?? CPT_WILDCARD);

    const row = cptRow(variable, parentKey);
    if (row === null) {
      throw new Error(
        `Variable "${variable.id}" has no conditional distribution for parent "${parentKey}" ` +
          `(add that row to its cpt, or a "${CPT_WILDCARD}" fallback row).`,
      );
    }

    // Restrict to declared levels so a stray CPT key cannot invent a level.
    const entries: WeightedEntry[] = normalizeRecord(
      Object.fromEntries(variable.levels.map((l) => [l.id, row[l.id] ?? 0])),
    );
    const chosen = sampleEntry(entries, rng);
    const level = variable.levels.find((l) => l.id === chosen.id);

    draws[variable.id] = {
      levelId: chosen.id,
      value: level?.range ? sampleRange(level.range, rng) : null,
    };
  }

  return draws;
}
