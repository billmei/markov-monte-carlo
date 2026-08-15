import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { RunResult, Scenario } from "@/engine";
import { seriesColor } from "@/theme/tokens";
import { useThemeTokens } from "@/theme/useColorScheme";
import { useAppStore } from "@/state/store";
import { formatValue } from "./selectors";
import { EmptyState } from "./OutcomeHistogram";

const ROW_HEIGHT = 30;
const OVERSCAN = 8;
const VIEWPORT_HEIGHT = 340;

type SortKey = "id" | "terminal" | "steps" | string;

/**
 * Every run, as rows.
 *
 * Windowed rather than fully rendered — a 50,000-run simulation would otherwise
 * put 50,000 table rows in the DOM. Only the visible slice plus a small
 * overscan is mounted, with spacer rows holding the scroll height.
 *
 * This view is also what discharges the palette's light-mode contrast warning:
 * every result is readable as text here, independent of colour.
 */
export function RunTable({
  scenario,
  runs,
}: {
  scenario: Scenario;
  runs: RunResult[];
}): ReactNode {
  const tokens = useThemeTokens();
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectRun = useAppStore((s) => s.selectRun);

  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [ascending, setAscending] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);

  const stateIndex = useMemo(
    () => new Map(scenario.states.map((s, i) => [s.id, i])),
    [scenario],
  );

  const sorted = useMemo(() => {
    const direction = ascending ? 1 : -1;
    const copy = [...runs];

    copy.sort((a, b) => {
      if (sortKey === "id") return (a.id - b.id) * direction;
      if (sortKey === "steps") return (a.steps.length - b.steps.length) * direction;
      if (sortKey === "terminal") {
        return a.terminalStateId.localeCompare(b.terminalStateId) * direction;
      }
      const av = a.outcomes[sortKey];
      const bv = b.outcomes[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
      return String(av ?? "").localeCompare(String(bv ?? "")) * direction;
    });

    return copy;
  }, [runs, sortKey, ascending]);

  if (runs.length === 0) {
    return <EmptyState message="No runs in the current selection." />;
  }

  const total = sorted.length;
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const last = Math.min(total, first + visibleCount);
  const slice = sorted.slice(first, last);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    else {
      setSortKey(key);
      setAscending(true);
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (ascending ? " ▲" : " ▼") : "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
        {total.toLocaleString()} runs. Click a row to inspect its path.
      </p>

      <div
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{
          height: VIEWPORT_HEIGHT,
          overflow: "auto",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <SortableHeader label="Run" onClick={() => toggleSort("id")} indicator={sortIndicator("id")} align="right" width={64} />
              <SortableHeader label="Ends on" onClick={() => toggleSort("terminal")} indicator={sortIndicator("terminal")} align="left" />
              <SortableHeader label="Steps" onClick={() => toggleSort("steps")} indicator={sortIndicator("steps")} align="right" width={62} />
              {scenario.outcomes.map((outcome) => (
                <SortableHeader
                  key={outcome.id}
                  label={outcome.label}
                  onClick={() => toggleSort(outcome.id)}
                  indicator={sortIndicator(outcome.id)}
                  align={outcome.kind === "numeric" ? "right" : "left"}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {first > 0 ? <tr style={{ height: first * ROW_HEIGHT }} /> : null}

            {slice.map((run) => {
              const isSelected = run.id === selectedRunId;
              const index = stateIndex.get(run.terminalStateId) ?? 0;

              return (
                <tr
                  key={run.id}
                  onClick={() => selectRun(isSelected ? null : run.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectRun(isSelected ? null : run.id);
                    }
                  }}
                  style={{
                    height: ROW_HEIGHT,
                    cursor: "pointer",
                    borderTop: "1px solid var(--border)",
                    background: isSelected ? "var(--surface-3)" : "transparent",
                    outline: isSelected ? `2px solid ${tokens.accent}` : "none",
                    outlineOffset: -2,
                  }}
                >
                  <td className="tabular" style={{ ...cell, textAlign: "right", color: "var(--text-muted)" }}>
                    {run.id}
                  </td>
                  <td style={{ ...cell, textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: seriesColor(tokens, index),
                          flexShrink: 0,
                        }}
                      />
                      {scenario.states.find((s) => s.id === run.terminalStateId)?.label ??
                        run.terminalStateId}
                    </span>
                  </td>
                  <td className="tabular" style={{ ...cell, textAlign: "right", color: "var(--text-muted)" }}>
                    {run.steps.length}
                  </td>
                  {scenario.outcomes.map((outcome) => (
                    <td
                      key={outcome.id}
                      className={outcome.kind === "numeric" ? "tabular" : undefined}
                      style={{
                        ...cell,
                        textAlign: outcome.kind === "numeric" ? "right" : "left",
                      }}
                    >
                      {formatValue(run.outcomes[outcome.id] ?? null, outcome.unit)}
                    </td>
                  ))}
                </tr>
              );
            })}

            {last < total ? <tr style={{ height: (total - last) * ROW_HEIGHT }} /> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  onClick,
  indicator,
  align,
  width,
}: {
  label: string;
  onClick: () => void;
  indicator: string;
  align: "left" | "right";
  width?: number;
}): ReactNode {
  return (
    <th
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "var(--surface-2)",
        padding: 0,
        width,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%",
          textAlign: align,
          background: "none",
          border: "none",
          padding: "7px 10px",
          cursor: "pointer",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        {indicator}
      </button>
    </th>
  );
}

const cell: CSSProperties = {
  padding: "0 10px",
  whiteSpace: "nowrap",
  color: "var(--text-secondary)",
};
