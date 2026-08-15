/**
 * Public surface of the simulation engine.
 *
 * The UI imports from here and nowhere deeper, so internals stay free to move.
 * Nothing under `src/engine` imports React.
 */

export * from "./types";
export { mulberry32, deriveSeed, randomSeed, type Rng } from "./rng";
export {
  normalizeEntries,
  normalizeRecord,
  sampleEntry,
  sampleRange,
  type WeightedEntry,
} from "./sample";
export { indexScenario, isTerminal, simulatePath, type ScenarioIndex, type PathStep } from "./markov";
export { evaluateStep, cptRow, CPT_WILDCARD } from "./variables";
export { runMonteCarlo, evaluateOutcome } from "./simulate";
export {
  histogram,
  frequency,
  percentile,
  percentileBands,
  runSeries,
  sampleRunIndices,
  summarize,
  DEFAULT_PERCENTILES,
  type CategoryCount,
  type HistogramBin,
  type NumericSummary,
  type PercentileBand,
} from "./stats";
export {
  buildFlowFromRuns,
  buildAnalyticFlow,
  type FlowGraph,
  type FlowLink,
  type FlowNode,
} from "./sankey";
export {
  scenarioSchema,
  validateScenario,
  parseScenarioJson,
  type ValidationIssue,
  type ValidationResult,
} from "./schema";
