import type { Scenario } from "@/engine";

/**
 * Live UI edits, held as an overlay on top of the scenario file rather than
 * mutating it.
 *
 * Keeping edits separate is what makes "reset to file" a single delete, lets
 * the UI show what has drifted from the source, and lets export emit a valid
 * scenario with the edits baked in. Topology is never part of the overlay —
 * which states exist and which transitions are possible stays the JSON's job.
 */
export interface EditOverlay {
  /** `fromStateId` → `toStateId` → weight. */
  transitions: Record<string, Record<string, number>>;
  /** `variableId` → parent key → `levelId` → weight. */
  cpts: Record<string, Record<string, Record<string, number>>>;
  /** `stateId` → start weight. */
  initial: Record<string, number>;
}

export function emptyOverlay(): EditOverlay {
  return { transitions: {}, cpts: {}, initial: {} };
}

export function isOverlayEmpty(overlay: EditOverlay): boolean {
  return (
    Object.keys(overlay.transitions).length === 0 &&
    Object.keys(overlay.cpts).length === 0 &&
    Object.keys(overlay.initial).length === 0
  );
}

/** Number of distinct distributions the user has touched. */
export function countEdits(overlay: EditOverlay): number {
  const cptRows = Object.values(overlay.cpts).reduce(
    (sum, rows) => sum + Object.keys(rows).length,
    0,
  );
  return (
    Object.keys(overlay.transitions).length +
    cptRows +
    (Object.keys(overlay.initial).length > 0 ? 1 : 0)
  );
}

/**
 * Produces the scenario the engine should actually run: the file with every
 * overlaid distribution substituted in. Unknown ids in the overlay are ignored,
 * so a stale overlay can never corrupt a newly loaded scenario.
 */
export function applyEdits(base: Scenario, overlay: EditOverlay): Scenario {
  const transitions: Scenario["transitions"] = {};
  for (const [from, list] of Object.entries(base.transitions)) {
    const edited = overlay.transitions[from];
    transitions[from] = edited
      ? list.map((t) => ({ ...t, p: edited[t.to] ?? t.p }))
      : list;
  }

  const variables = base.variables.map((variable) => {
    const editedRows = overlay.cpts[variable.id];
    if (!editedRows) return variable;

    const cpt: typeof variable.cpt = {};
    for (const [parentKey, row] of Object.entries(variable.cpt)) {
      const edited = editedRows[parentKey];
      cpt[parentKey] = edited ? { ...row, ...edited } : row;
    }
    return { ...variable, cpt };
  });

  const initial =
    Object.keys(overlay.initial).length > 0
      ? Object.fromEntries(
          Object.entries(base.initial).map(([id, weight]) => [
            id,
            overlay.initial[id] ?? weight,
          ]),
        )
      : base.initial;

  return { ...base, transitions, variables, initial };
}
