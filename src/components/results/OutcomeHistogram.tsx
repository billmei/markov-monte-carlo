import { useMemo, type ReactNode } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { histogram, summarize, type OutcomeSpec, type RunResult } from "@/engine";
import { baseOptions, valueMarkersPlugin, type ValueMarker } from "@/charts/theme";
import { useThemeTokens } from "@/theme/useColorScheme";
import { withAlpha } from "@/theme/tokens";
import { formatNumber, numericValues } from "./selectors";

/**
 * Distribution of a numeric outcome across runs, with percentile markers.
 *
 * Single series, so no legend — the title names it. The x scale is linear
 * rather than categorical so the P5/P50/P95 rules can be positioned at their
 * true values instead of snapped to a bin edge.
 */
export function OutcomeHistogram({
  runs,
  outcome,
}: {
  runs: RunResult[];
  outcome: OutcomeSpec;
}): ReactNode {
  const tokens = useThemeTokens();

  const { values, bins, stats } = useMemo(() => {
    const v = numericValues(runs, outcome.id);
    const binCount = Math.max(8, Math.min(40, Math.ceil(Math.sqrt(v.length))));
    return { values: v, bins: histogram(v, binCount), stats: summarize(v) };
  }, [runs, outcome.id]);

  if (values.length === 0) {
    return <EmptyState message="No numeric values for this outcome in the current selection." />;
  }

  const markers: ValueMarker[] = [
    { value: stats.p[5] ?? 0, label: "P5", color: tokens.textMuted },
    { value: stats.p[50] ?? 0, label: "P50", color: tokens.textPrimary, dash: [] },
    { value: stats.p[95] ?? 0, label: "P95", color: tokens.textMuted },
    { value: stats.mean, label: "mean", color: tokens.accent, dash: [2, 2] },
  ];

  const base = baseOptions(tokens);
  const options: ChartOptions<"bar"> = {
    ...(base as ChartOptions<"bar">),
    plugins: {
      ...base.plugins,
      valueMarkers: { markers },
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          title: (items) => {
            const bin = bins[items[0]?.dataIndex ?? 0];
            if (!bin) return "";
            return `${formatNumber(bin.x0)} to ${formatNumber(bin.x1)}${
              outcome.unit ? ` ${outcome.unit}` : ""
            }`;
          },
          label: (item) => {
            const count = item.parsed.y ?? 0;
            return `${count.toLocaleString()} runs (${((count / values.length) * 100).toFixed(1)}%)`;
          },
        },
      },
    },
    scales: {
      ...base.scales,
      x: {
        ...base.scales?.x,
        type: "linear",
        offset: false,
        title: {
          display: true,
          text: outcome.unit ? `${outcome.label} (${outcome.unit})` : outcome.label,
          color: tokens.textMuted,
          font: { size: 11 },
        },
      },
      y: {
        ...base.scales?.y,
        beginAtZero: true,
        title: { display: true, text: "runs", color: tokens.textMuted, font: { size: 11 } },
      },
    },
  } as ChartOptions<"bar">;

  const data = {
    datasets: [
      {
        label: outcome.label,
        data: bins.map((bin) => ({ x: (bin.x0 + bin.x1) / 2, y: bin.count })),
        backgroundColor: withAlpha(tokens.series[0]!, 0.85),
        hoverBackgroundColor: tokens.series[0]!,
        borderRadius: 4,
        borderSkipped: "bottom" as const,
        // A hair under 1 leaves the 2px surface gap between adjacent bars.
        barPercentage: 0.92,
        categoryPercentage: 1,
      },
    ],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <SummaryStrip
        items={[
          { label: "Median", value: formatNumber(stats.p[50] ?? 0, outcome.unit) },
          { label: "Mean", value: formatNumber(stats.mean, outcome.unit) },
          { label: "P5–P95", value: `${formatNumber(stats.p[5] ?? 0)} – ${formatNumber(stats.p[95] ?? 0)}` },
          { label: "Std dev", value: formatNumber(stats.sd, outcome.unit) },
        ]}
      />
      <div style={{ flex: 1, minHeight: 220 }}>
        <Bar data={data} options={options} plugins={[valueMarkersPlugin]} />
      </div>
    </div>
  );
}

export function SummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}): ReactNode {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div className="label">{item.label}</div>
          <div className="tabular" style={{ fontSize: 16, fontWeight: 600, marginTop: 1 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message: string }): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 200,
        color: "var(--text-muted)",
        fontSize: 13,
        textAlign: "center",
        padding: 24,
      }}
    >
      {message}
    </div>
  );
}
