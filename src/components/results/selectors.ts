import type {
  OutcomeSpec,
  OutcomeValue,
  RunResult,
  Scenario,
  SimulationResult,
} from "@/engine";

/**
 * Derivations shared by the four result views, so they always agree about
 * which runs are in scope and which variable a trace chart is showing.
 */

/** Runs matching the active category filter. */
export function filterRuns(
  result: SimulationResult,
  outcome: OutcomeSpec | null,
  categoryFilter: string | null,
): RunResult[] {
  if (!outcome || categoryFilter === null) return result.runs;
  return result.runs.filter((run) => run.outcomes[outcome.id] === categoryFilter);
}

export function numericValues(runs: RunResult[], outcomeId: string): number[] {
  const values: number[] = [];
  for (const run of runs) {
    const value = run.outcomes[outcomeId];
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  return values;
}

export function categoricalValues(runs: RunResult[], outcomeId: string): Array<string | null> {
  return runs.map((run) => {
    const value = run.outcomes[outcomeId];
    return typeof value === "string" ? value : null;
  });
}

/**
 * The variable the trace chart should plot.
 *
 * Prefers the variable backing the selected outcome, so switching outcome
 * switches the traces with it; falls back to the last variable that carries
 * numeric ranges, which is the end of the causal chain.
 */
export function traceVariableId(scenario: Scenario, outcome: OutcomeSpec | null): string | null {
  if (outcome?.source.type === "variable") return outcome.source.variableId;
  if (outcome?.source.type === "variableLevel") return outcome.source.variableId;

  for (let i = scenario.variables.length - 1; i >= 0; i--) {
    const variable = scenario.variables[i]!;
    if (variable.levels.some((l) => l.range)) return variable.id;
  }
  return null;
}

/** True when the variable actually has numeric ranges to plot. */
export function isNumericVariable(scenario: Scenario, variableId: string | null): boolean {
  if (!variableId) return false;
  const variable = scenario.variables.find((v) => v.id === variableId);
  return Boolean(variable?.levels.some((l) => l.range));
}

export function findOutcome(scenario: Scenario, outcomeId: string | null): OutcomeSpec | null {
  return scenario.outcomes.find((o) => o.id === outcomeId) ?? null;
}

/** Formats an outcome value for a table cell or tooltip. */
export function formatValue(value: OutcomeValue, unit?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

export function formatNumber(value: number, unit?: string): string {
  return formatValue(value, unit);
}
