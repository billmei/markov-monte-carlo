import type { MarkovState, Scenario, Variable } from "./types";
import { normalizeEntries, normalizeRecord, sampleEntry, type WeightedEntry } from "./sample";
import type { Rng } from "./rng";

/**
 * Lookup tables derived from a scenario. Building these once per simulation
 * keeps the inner rollout loop free of repeated array scans, and the UI reuses
 * the same maps for rendering.
 */
export interface ScenarioIndex {
  states: Map<string, MarkovState>;
  variables: Map<string, Variable>;
  /** Normalized outgoing distribution per source state. */
  outgoing: Map<string, WeightedEntry[]>;
  initial: WeightedEntry[];
}

export function indexScenario(scenario: Scenario): ScenarioIndex {
  const states = new Map(scenario.states.map((s) => [s.id, s]));
  const variables = new Map(scenario.variables.map((v) => [v.id, v]));

  const outgoing = new Map<string, WeightedEntry[]>();
  for (const [from, transitions] of Object.entries(scenario.transitions)) {
    if (transitions.length === 0) continue;
    outgoing.set(
      from,
      normalizeEntries(transitions.map((t) => ({ id: t.to, weight: t.p }))),
    );
  }

  return { states, variables, outgoing, initial: normalizeRecord(scenario.initial) };
}

/** True when a state ends an absorbing run: flagged terminal, or a dead end. */
export function isTerminal(index: ScenarioIndex, stateId: string): boolean {
  if (index.states.get(stateId)?.terminal) return true;
  return !index.outgoing.has(stateId);
}

export interface PathStep {
  stateId: string;
  /** Normalized probability of the branch that led here. */
  p: number;
}

/**
 * Rolls a single path through the chain.
 *
 * In `absorbing` mode the path stops on the first terminal state, bounded by
 * `maxSteps`. In `horizon` mode the path is always exactly `maxSteps` entries;
 * a terminal state reached early self-loops for the remaining periods, which is
 * the standard absorbing-state convention and keeps every run the same length
 * for the trace chart.
 */
export function simulatePath(
  scenario: Scenario,
  index: ScenarioIndex,
  rng: Rng,
  maxSteps: number,
): PathStep[] {
  const steps = Math.max(1, Math.floor(maxSteps));
  const first = sampleEntry(index.initial, rng);
  const path: PathStep[] = [{ stateId: first.id, p: first.weight }];

  while (path.length < steps) {
    const current = path[path.length - 1]!;
    const terminal = isTerminal(index, current.stateId);

    if (terminal) {
      if (scenario.mode === "absorbing") break;
      // Horizon mode: hold the absorbing state for the remaining periods.
      path.push({ stateId: current.stateId, p: 1 });
      continue;
    }

    const distribution = index.outgoing.get(current.stateId)!;
    const next = sampleEntry(distribution, rng);
    path.push({ stateId: next.id, p: next.weight });
  }

  return path;
}
