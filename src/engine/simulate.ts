import { deriveSeed, mulberry32 } from "./rng";
import { indexScenario, simulatePath, type ScenarioIndex } from "./markov";
import { evaluateStep } from "./variables";
import type {
  OutcomeSpec,
  OutcomeValue,
  RunResult,
  Scenario,
  SimulationConfig,
  SimulationResult,
  StepRecord,
} from "./types";

/** Reads one declared outcome off a finished run's final step. */
export function evaluateOutcome(
  spec: OutcomeSpec,
  index: ScenarioIndex,
  steps: StepRecord[],
  terminalStateId: string,
): OutcomeValue {
  const final = steps[steps.length - 1];

  switch (spec.source.type) {
    case "variable": {
      return final?.vars[spec.source.variableId]?.value ?? null;
    }
    case "variableLevel": {
      const variableId = spec.source.variableId;
      const levelId = final?.vars[variableId]?.levelId;
      if (levelId === undefined) return null;
      const variable = index.variables.get(variableId);
      return variable?.levels.find((l) => l.id === levelId)?.label ?? levelId;
    }
    case "terminalState": {
      return index.states.get(terminalStateId)?.label ?? terminalStateId;
    }
    case "stateCategory": {
      const state = index.states.get(terminalStateId);
      return state?.category ?? state?.label ?? terminalStateId;
    }
    default:
      return null;
  }
}

/**
 * Runs the Monte Carlo simulation.
 *
 * Pure: identical `(scenario, config)` inputs always produce an identical
 * result, which is what makes "click a run to see its history" trustworthy and
 * lets the UI compare before/after a probability edit.
 */
export function runMonteCarlo(
  scenario: Scenario,
  config: SimulationConfig,
): SimulationResult {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const index = indexScenario(scenario);
  const maxSteps = config.maxSteps ?? scenario.maxSteps;
  const runCount = Math.max(1, Math.floor(config.runs));

  const runs: RunResult[] = [];
  let maxStepCount = 0;

  for (let i = 0; i < runCount; i++) {
    const rng = mulberry32(deriveSeed(config.seed, i));
    const path = simulatePath(scenario, index, rng, maxSteps);

    const steps: StepRecord[] = path.map((hop, step) => ({
      step,
      stateId: hop.stateId,
      p: hop.p,
      vars: evaluateStep(scenario, hop.stateId, rng),
    }));

    const terminalStateId = steps[steps.length - 1]!.stateId;
    const absorbed = Boolean(index.states.get(terminalStateId)?.terminal);

    const outcomes: Record<string, OutcomeValue> = {};
    for (const spec of scenario.outcomes) {
      outcomes[spec.id] = evaluateOutcome(spec, index, steps, terminalStateId);
    }

    runs.push({ id: i, steps, terminalStateId, absorbed, outcomes });
    if (steps.length > maxStepCount) maxStepCount = steps.length;
  }

  const finishedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    scenarioId: scenario.id,
    config: { ...config, runs: runCount },
    runs,
    variableIds: scenario.variables.map((v) => v.id),
    maxStepCount,
    durationMs: finishedAt - startedAt,
  };
}
