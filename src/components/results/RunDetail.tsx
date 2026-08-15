import type { ReactNode } from "react";
import type { RunResult, Scenario } from "@/engine";
import { seriesColor } from "@/theme/tokens";
import { useThemeTokens } from "@/theme/useColorScheme";
import { useAppStore } from "@/state/store";
import { formatValue } from "./selectors";

/**
 * Step-by-step history of one run.
 *
 * This is the answer to "which side did it go through" — each hop names the
 * state reached and the probability of the branch that was actually taken, so a
 * run that took a 4% path is visibly distinguishable from one that took the
 * obvious route.
 */
export function RunDetail({
  scenario,
  run,
}: {
  scenario: Scenario;
  run: RunResult;
}): ReactNode {
  const tokens = useThemeTokens();
  const selectRun = useAppStore((s) => s.selectRun);

  return (
    <div
      className="card"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 650 }}>Run {run.id}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {run.steps.length} steps · ends on{" "}
            {scenario.states.find((s) => s.id === run.terminalStateId)?.label ?? run.terminalStateId}
            {run.absorbed ? " (absorbed)" : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => selectRun(null)}
          style={{ padding: "3px 9px", fontSize: 11 }}
        >
          Clear selection
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
        {scenario.outcomes.map((outcome) => (
          <div key={outcome.id}>
            <div className="label">{outcome.label}</div>
            <div className="tabular" style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>
              {formatValue(run.outcomes[outcome.id] ?? null, outcome.unit)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ maxHeight: 300, overflowY: "auto", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {run.steps.map((step, i) => {
            const state = scenario.states.find((s) => s.id === step.stateId);
            const index = scenario.states.findIndex((s) => s.id === step.stateId);
            const color = seriesColor(tokens, index < 0 ? 0 : index);

            return (
              <li key={i} style={{ display: "flex", gap: 9 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <span
                    aria-hidden
                    style={{ width: 10, height: 10, borderRadius: 3, background: color, marginTop: 3 }}
                  />
                  {i < run.steps.length - 1 ? (
                    <span
                      aria-hidden
                      style={{ flex: 1, width: 1, background: "var(--border)", marginTop: 3 }}
                    />
                  ) : null}
                </div>

                <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      step {step.step + 1}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {state?.label ?? step.stateId}
                    </span>
                    <span
                      className="tabular"
                      title={
                        i === 0
                          ? "Probability of starting here"
                          : "Probability of the branch this run took"
                      }
                      style={{ fontSize: 11, color: "var(--text-muted)" }}
                    >
                      {i === 0 ? "start " : "→ "}
                      {(step.p * 100).toFixed(1)}%
                    </span>
                  </div>

                  {scenario.variables.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: 3 }}>
                      {scenario.variables.map((variable) => {
                        const draw = step.vars[variable.id];
                        if (!draw) return null;
                        const level = variable.levels.find((l) => l.id === draw.levelId);
                        return (
                          <span key={variable.id} style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            <span style={{ color: "var(--text-muted)" }}>{variable.label}:</span>{" "}
                            {level?.label ?? draw.levelId}
                            {draw.value !== null ? (
                              <span className="tabular">
                                {" "}
                                ({formatValue(draw.value, variable.unit)})
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
