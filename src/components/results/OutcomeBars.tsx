import { useMemo, useRef, type ReactNode } from "react";
import { Bar } from "react-chartjs-2";
import type { Chart as ChartInstance, ChartOptions } from "chart.js";
import { frequency, type OutcomeSpec, type RunResult, type Scenario } from "@/engine";
import { barValueLabelsPlugin, baseOptions } from "@/charts/theme";
import { seriesColor, withAlpha } from "@/theme/tokens";
import { useThemeTokens } from "@/theme/useColorScheme";
import { useAppStore } from "@/state/store";
import { categoricalValues } from "./selectors";
import { EmptyState } from "./OutcomeHistogram";

/**
 * How many runs landed on each outcome category.
 *
 * Horizontal bars, because outcome labels are words rather than dates. Each bar
 * carries its count and share as a direct label — required here, not
 * decorative: the light-mode palette puts three categorical slots under 3:1
 * against the surface, and visible labels are the relief.
 */
export function OutcomeBars({
  scenario,
  runs,
  outcome,
}: {
  scenario: Scenario;
  runs: RunResult[];
  outcome: OutcomeSpec;
}): ReactNode {
  const tokens = useThemeTokens();
  const chartRef = useRef<ChartInstance<"bar", number[], string> | null>(null);

  const categoryFilter = useAppStore((s) => s.categoryFilter);
  const setCategoryFilter = useAppStore((s) => s.setCategoryFilter);

  const counts = useMemo(
    () => frequency(categoricalValues(runs, outcome.id)),
    [runs, outcome.id],
  );

  /**
   * Terminal-state outcomes reuse the state's own colour so a bar and its
   * Sankey node read as the same entity. Other categorical outcomes are a
   * magnitude comparison, so they take a single hue.
   */
  const colorFor = useMemo(() => {
    if (outcome.source.type !== "terminalState") {
      return () => tokens.series[0]!;
    }
    const byLabel = new Map(scenario.states.map((s, i) => [s.label, seriesColor(tokens, i)]));
    return (key: string) => byLabel.get(key) ?? tokens.series[0]!;
  }, [outcome.source.type, scenario.states, tokens]);

  if (counts.length === 0) {
    return <EmptyState message="No categorical results for this outcome." />;
  }

  const labels = counts.map((c) => c.key);
  const base = baseOptions(tokens);

  const options: ChartOptions<"bar"> = {
    ...(base as ChartOptions<"bar">),
    indexAxis: "y",
    layout: { padding: { top: 4, right: 76, bottom: 0, left: 0 } },
    onClick: (event) => {
      const chart = chartRef.current;
      if (!chart) return;
      const hits = chart.getElementsAtEventForMode(
        event.native as Event,
        "nearest",
        { intersect: true },
        false,
      );
      const key = labels[hits[0]?.index ?? -1];
      if (key === undefined) return;
      setCategoryFilter(categoryFilter === key ? null : key);
    },
    plugins: {
      ...base.plugins,
      barValueLabels: {
        color: tokens.textSecondary,
        labels: counts.map((c) => `${c.count.toLocaleString()} · ${(c.share * 100).toFixed(1)}%`),
      },
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          label: (item) => {
            const entry = counts[item.dataIndex];
            if (!entry) return "";
            return `${entry.count.toLocaleString()} runs (${(entry.share * 100).toFixed(2)}%)`;
          },
        },
      },
    },
    scales: {
      x: {
        ...base.scales?.y,
        beginAtZero: true,
        grid: { color: tokens.gridline, drawTicks: false },
        title: { display: true, text: "runs", color: tokens.textMuted, font: { size: 11 } },
      },
      y: {
        ...base.scales?.x,
        grid: { display: false },
        ticks: { ...base.scales?.x?.ticks, autoSkip: false },
      },
    },
  } as ChartOptions<"bar">;

  const data = {
    labels,
    datasets: [
      {
        label: outcome.label,
        data: counts.map((c) => c.count),
        backgroundColor: counts.map((c) =>
          categoryFilter === null || categoryFilter === c.key
            ? withAlpha(colorFor(c.key), 0.85)
            : withAlpha(colorFor(c.key), 0.22),
        ),
        hoverBackgroundColor: counts.map((c) => colorFor(c.key)),
        borderRadius: 4,
        borderSkipped: "start" as const,
        barPercentage: 0.82,
        categoryPercentage: 0.86,
      },
    ],
  };

  const height = Math.max(200, counts.length * 38 + 60);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
        {categoryFilter
          ? `Filtered to “${categoryFilter}”. Click the bar again to clear.`
          : "Click a bar to filter the other views to those runs."}
      </p>
      <div style={{ height, minHeight: 200 }}>
        <Bar
          ref={(instance) => {
            chartRef.current = instance ?? null;
          }}
          data={data}
          options={options}
          plugins={[barValueLabelsPlugin]}
        />
      </div>
    </div>
  );
}
