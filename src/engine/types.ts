/**
 * Core data model for the simulator.
 *
 * A Scenario is authored as a self-contained JSON file. It describes:
 *   1. a Markov chain (states + transition probabilities),
 *   2. an ordered causal chain of variables, each conditioned on one parent
 *      (either the Markov state or the previous variable),
 *   3. the outcomes the results panel is allowed to chart.
 *
 * Nothing in this module imports React. The engine is deliberately isolated so
 * scenarios stay pure data and the UI can be developed against a stable surface.
 */

/** Sentinel `parent` value meaning "conditioned on the Markov state at this step". */
export const STATE_PARENT = "$state";

/**
 * How a rollout advances through the chain.
 *
 * - `absorbing`: follow transitions until a terminal state is reached (or
 *   `maxSteps` is hit as a safety cap). Path length varies between runs.
 * - `horizon`: run for exactly `maxSteps` periods. States may recur. A terminal
 *   state encountered along the way self-loops for the remaining periods.
 */
export type ChainMode = "absorbing" | "horizon";

export interface MarkovState {
  id: string;
  label: string;
  /** Terminal states have no outgoing transitions and end an absorbing run. */
  terminal?: boolean;
  /**
   * Optional coarse grouping used by the `stateCategory` outcome source, e.g.
   * tagging several terminal states as "success" vs "failure".
   */
  category?: string;
  /** Free-form pre-formatted text shown on hover. Sources and citations go here. */
  notes?: string;
}

export interface Transition {
  to: string;
  /** Relative weight. Weights out of a state are normalized to sum to 1. */
  p: number;
  notes?: string;
}

export interface Level {
  id: string;
  label: string;
  /**
   * Numeric interval sampled uniformly when this level is drawn. Omit for a
   * purely categorical variable, in which case the step's value is null.
   */
  range?: [number, number];
}

/**
 * A node in the causal chain downstream of the Markov state.
 *
 * `cpt` maps a parent key to a weight distribution over this variable's levels.
 * The parent key is a state id when `parent` is `$state`, otherwise a level id
 * of the parent variable. The key `"*"` acts as a fallback row.
 */
export interface Variable {
  id: string;
  label: string;
  parent: string;
  unit?: string;
  levels: Level[];
  cpt: Record<string, Record<string, number>>;
  notes?: string;
}

export type OutcomeSource =
  /** Numeric value drawn for a variable at the final step. */
  | { type: "variable"; variableId: string }
  /** Level label chosen for a variable at the final step. */
  | { type: "variableLevel"; variableId: string }
  /** The state the run ended on. */
  | { type: "terminalState" }
  /** The `category` tag of the state the run ended on. */
  | { type: "stateCategory" };

export interface OutcomeSpec {
  id: string;
  label: string;
  kind: "numeric" | "categorical";
  source: OutcomeSource;
  unit?: string;
  notes?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  mode: ChainMode;
  /**
   * `absorbing`: safety cap on path length.
   * `horizon`: the exact number of periods, counting the initial state.
   */
  maxSteps: number;
  /** Default seed. The settings panel can override it. */
  seed?: number;
  states: MarkovState[];
  /** Relative weights over start states; normalized. */
  initial: Record<string, number>;
  /** Keyed by source state id. Terminal states are absent. */
  transitions: Record<string, Transition[]>;
  variables: Variable[];
  outcomes: OutcomeSpec[];
}

/** One variable's draw at one step. */
export interface VariableDraw {
  levelId: string;
  /** null when the chosen level declares no numeric range. */
  value: number | null;
}

export interface StepRecord {
  step: number;
  stateId: string;
  /**
   * Probability of arriving here: the normalized initial weight at step 0,
   * otherwise the normalized probability of the transition that was taken.
   */
  p: number;
  vars: Record<string, VariableDraw>;
}

export type OutcomeValue = number | string | null;

export interface RunResult {
  id: number;
  steps: StepRecord[];
  /** State the run ended on. */
  terminalStateId: string;
  /** True when the run stopped on a terminal state rather than running out of steps. */
  absorbed: boolean;
  outcomes: Record<string, OutcomeValue>;
}

export interface SimulationConfig {
  runs: number;
  seed: number;
  /** Overrides `scenario.maxSteps` when set. */
  maxSteps?: number;
}

export interface SimulationResult {
  scenarioId: string;
  config: SimulationConfig;
  runs: RunResult[];
  /** Declared variable ids, in causal order. */
  variableIds: string[];
  /** Longest path observed, used to size the Sankey and trace charts. */
  maxStepCount: number;
  durationMs: number;
}
