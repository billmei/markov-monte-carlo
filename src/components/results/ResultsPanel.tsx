import { useMemo, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { Scenario } from "@/engine";
import { useAppStore } from "@/state/store";
import { OutcomeBars } from "./OutcomeBars";
import { EmptyState, OutcomeHistogram } from "./OutcomeHistogram";
import { RunDetail } from "./RunDetail";
import { RunTable } from "./RunTable";
import { RunTraces } from "./RunTraces";
import { filterRuns, findOutcome, isNumericVariable, traceVariableId } from "./selectors";

type ViewId = "distribution" | "traces" | "outcomes" | "table";

/**
 * Monte Carlo results.
 *
 * The four views share one outcome selector, one filtered run set and one
 * selected run, so clicking a run in any of them highlights it in the others
 * and along the Sankey path on the left.
 */
export function ResultsPanel({ scenario }: { scenario: Scenario }): ReactNode {
  const result = useAppStore((s) => s.result);
  const selectedOutcomeId = useAppStore((s) => s.selectedOutcomeId);
  const selectOutcome = useAppStore((s) => s.selectOutcome);
  const categoryFilter = useAppStore((s) => s.categoryFilter);
  const setCategoryFilter = useAppStore((s) => s.setCategoryFilter);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const dirty = useAppStore((s) => s.dirty);

  const outcome = findOutcome(scenario, selectedOutcomeId);

  const runs = useMemo(
    () => (result ? filterRuns(result, outcome, categoryFilter) : []),
    [result, outcome, categoryFilter],
  );

  const selectedRun = useMemo(
    () => (selectedRunId === null ? null : (result?.runs.find((r) => r.id === selectedRunId) ?? null)),
    [result, selectedRunId],
  );

  const variableId = traceVariableId(scenario, outcome);
  const canTrace = isNumericVariable(scenario, variableId);
  const isNumeric = outcome?.kind === "numeric";

  // Land on a view the current outcome can actually render.
  const defaultView: ViewId = isNumeric ? "distribution" : "outcomes";

  if (!result) {
    return <EmptyState message="Run a simulation to see results." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label className="label" htmlFor="outcome-select">
          Outcome
        </label>
        <select
          id="outcome-select"
          className="field"
          value={selectedOutcomeId ?? ""}
          onChange={(e) => selectOutcome(e.target.value)}
          style={{ width: "auto", minWidth: 180, flex: "0 1 auto" }}
        >
          {scenario.outcomes.map((spec) => (
            <option key={spec.id} value={spec.id}>
              {spec.label} ({spec.kind})
            </option>
          ))}
        </select>

        {categoryFilter ? (
          <button
            type="button"
            className="btn"
            onClick={() => setCategoryFilter(null)}
            style={{ padding: "3px 9px", fontSize: 11 }}
          >
            Filtered: {categoryFilter} ✕
          </button>
        ) : null}

        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>
          {runs.length.toLocaleString()} of {result.runs.length.toLocaleString()} runs ·{" "}
          {result.durationMs.toFixed(0)}ms
          {dirty ? " · stale" : ""}
        </span>
      </div>

      <Tabs.Root key={defaultView} defaultValue={defaultView}>
        <Tabs.List
          aria-label="Result views"
          style={{
            display: "flex",
            gap: 2,
            borderBottom: "1px solid var(--border)",
            marginBottom: 12,
            overflowX: "auto",
          }}
        >
          <TabTrigger value="distribution" disabled={!isNumeric} label="Distribution" />
          <TabTrigger value="traces" disabled={!canTrace} label="Run traces" />
          <TabTrigger value="outcomes" disabled={outcome?.kind !== "categorical"} label="Outcomes" />
          <TabTrigger value="table" label="Run table" />
        </Tabs.List>

        <Tabs.Content value="distribution" style={{ outline: "none" }}>
          {outcome && isNumeric ? (
            <OutcomeHistogram runs={runs} outcome={outcome} />
          ) : (
            <EmptyState message="This outcome is categorical — use the Outcomes view." />
          )}
        </Tabs.Content>

        <Tabs.Content value="traces" style={{ outline: "none" }}>
          {canTrace && variableId ? (
            <RunTraces
              scenario={scenario}
              result={result}
              runs={runs}
              variableId={variableId}
            />
          ) : (
            <EmptyState message="No numeric variable to trace in this scenario." />
          )}
        </Tabs.Content>

        <Tabs.Content value="outcomes" style={{ outline: "none" }}>
          {outcome && outcome.kind === "categorical" ? (
            <OutcomeBars scenario={scenario} runs={runs} outcome={outcome} />
          ) : (
            <EmptyState message="This outcome is numeric — use the Distribution view." />
          )}
        </Tabs.Content>

        <Tabs.Content value="table" style={{ outline: "none" }}>
          <RunTable scenario={scenario} runs={runs} />
        </Tabs.Content>
      </Tabs.Root>

      {selectedRun ? <RunDetail scenario={scenario} run={selectedRun} /> : null}
    </div>
  );
}

function TabTrigger({
  value,
  label,
  disabled,
}: {
  value: ViewId;
  label: string;
  disabled?: boolean;
}): ReactNode {
  return (
    <Tabs.Trigger
      value={value}
      disabled={disabled}
      className="tab-trigger"
      style={{
        border: "none",
        background: "none",
        padding: "7px 12px",
        fontSize: 12.5,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        color: "var(--text-muted)",
        opacity: disabled ? 0.4 : 1,
        borderBottom: "2px solid transparent",
        marginBottom: -1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Tabs.Trigger>
  );
}
