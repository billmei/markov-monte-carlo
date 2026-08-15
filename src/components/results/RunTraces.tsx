import { useMemo, useRef, type ReactNode } from "react";
import { Line } from "react-chartjs-2";
import type { Chart as ChartInstance, ChartDataset, ChartOptions } from "chart.js";
import {
  percentileBands,
  runSeries,
  sampleRunIndices,
  type RunResult,
  type Scenario,
  type SimulationResult,
} from "@/engine";
import { baseOptions } from "@/charts/theme";
import { useThemeTokens } from "@/theme/useColorScheme";
import { useAppStore } from "@/state/store";
import { EmptyState } from "./OutcomeHistogram";

type TraceDataset = ChartDataset<"line", Array<number | null>> & { runId?: number };

/**
 * Individual runs plotted step by step, overlaid.
 *
 * Chart.js will not draw thousands of datasets smoothly, so this plots an
 * evenly spaced subset as thin low-alpha lines and overlays a P5–P95 band and
 * median computed from *every* run. The sample shows the texture of individual
 * paths; the band carries the exact shape of the full population, so nothing is
 * misrepresented by the sampling.
 */
export function RunTraces({
  scenario,
  result,
  runs,
  variableId,
}: {
  scenario: Scenario;
  result: SimulationResult;
  runs: RunResult[];
  variableId: string;
}): ReactNode {
  const tokens = useThemeTokens();
  const chartRef = useRef<ChartInstance<"line", Array<number | null>, number> | null>(null);

  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectRun = useAppStore((s) => s.selectRun);
  const limit = useAppStore((s) => s.settings.traceSampleLimit);

  const variable = scenario.variables.find((v) => v.id === variableId);

  const { datasets, sampledCount } = useMemo(() => {
    const indices = sampleRunIndices(runs.length, limit);
    const sampled = indices.map((i) => runs[i]!).filter(Boolean);

    const bands = percentileBands({ ...result, runs }, variableId, [5, 50, 95]);
    const steps = result.maxStepCount;
    const column = (q: number) =>
      Array.from({ length: steps }, (_, step) => bands.find((b) => b.step === step)?.values[q] ?? null);

    const traceDatasets: TraceDataset[] = sampled.map((run) => ({
      label: `Run ${run.id}`,
      data: runSeries(run, variableId),
      borderColor: tokens.trace,
      borderWidth: 0.75,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0.15,
      spanGaps: false,
      runId: run.id,
    }));

    const selected = selectedRunId === null ? null : runs.find((r) => r.id === selectedRunId);
    const selectedDataset: TraceDataset[] = selected
      ? [
          {
            label: `Run ${selected.id} (selected)`,
            data: runSeries(selected, variableId),
            borderColor: tokens.accent,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: tokens.accent,
            pointBorderColor: tokens.surface1,
            pointBorderWidth: 2,
            tension: 0.15,
            runId: selected.id,
          },
        ]
      : [];

    /** Band edge drawn on top of the traces so it survives the overplotting. */
    const edge = (q: number, label: string): TraceDataset =>
      ({
        label,
        data: column(q),
        borderColor: tokens.series[0]!,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.15,
      }) as TraceDataset;

    return {
      sampledCount: sampled.length,
      datasets: [
        // Band fill first: P95 fills down to the P5 dataset that follows it.
        {
          label: "P5–P95 of all runs",
          data: column(95),
          borderColor: "transparent",
          backgroundColor: tokens.band,
          fill: "+1",
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.15,
        } as TraceDataset,
        {
          label: "_p5fill",
          data: column(5),
          borderColor: "transparent",
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.15,
        } as TraceDataset,
        ...traceDatasets,
        // Then the summary lines, above the traces.
        edge(95, "_p95edge"),
        edge(5, "_p5edge"),
        {
          label: "Median of all runs",
          data: column(50),
          borderColor: tokens.textPrimary,
          borderWidth: 2,
          borderDash: [5, 3],
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.15,
        } as TraceDataset,
        ...selectedDataset,
      ],
    };
  }, [runs, result, variableId, limit, tokens, selectedRunId]);

  if (runs.length === 0 || !variable) {
    return <EmptyState message="No runs to trace in the current selection." />;
  }

  const base = baseOptions(tokens);
  const options: ChartOptions<"line"> = {
    ...(base as ChartOptions<"line">),
    onClick: (event) => {
      const chart = chartRef.current;
      if (!chart) return;
      const hits = chart.getElementsAtEventForMode(
        event.native as Event,
        "nearest",
        { intersect: false },
        false,
      );
      const hit = hits[0];
      if (!hit) return;
      const dataset = chart.data.datasets[hit.datasetIndex] as TraceDataset | undefined;
      if (dataset?.runId !== undefined) selectRun(dataset.runId);
    },
    interaction: { mode: "nearest", intersect: false, axis: "xy" },
    plugins: {
      ...base.plugins,
      legend: {
        ...base.plugins?.legend,
        display: true,
        labels: {
          ...base.plugins?.legend?.labels,
          // Hide the fill helper and the individual traces; the legend names
          // the band, the median and the selection, not 250 anonymous lines.
          filter: (item) =>
            item.text === "P5–P95 of all runs" ||
            item.text === "Median of all runs" ||
            item.text.endsWith("(selected)"),
        },
      },
      tooltip: {
        ...base.plugins?.tooltip,
        filter: (item) => !String((item.dataset as TraceDataset).label).startsWith("_"),
        callbacks: {
          title: (items) => `Step ${(items[0]?.parsed.x ?? 0) + 1}`,
          label: (item) => {
            const dataset = item.dataset as TraceDataset;
            const value = item.parsed.y;
            if (value === null || value === undefined) return "";
            const unit = variable.unit ? ` ${variable.unit}` : "";
            return `${dataset.label}: ${value.toFixed(2)}${unit}`;
          },
        },
      },
    },
    scales: {
      ...base.scales,
      x: {
        ...base.scales?.x,
        type: "linear",
        ticks: { ...base.scales?.x?.ticks, stepSize: 1, callback: (v) => Number(v) + 1 },
        title: { display: true, text: "step", color: tokens.textMuted, font: { size: 11 } },
      },
      y: {
        ...base.scales?.y,
        title: {
          display: true,
          text: variable.unit ? `${variable.label} (${variable.unit})` : variable.label,
          color: tokens.textMuted,
          font: { size: 11 },
        },
      },
    },
  } as ChartOptions<"line">;

  const labels = Array.from({ length: result.maxStepCount }, (_, i) => i);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
        Showing {sampledCount.toLocaleString()} of {runs.length.toLocaleString()} runs as individual
        traces. The band and median are computed from all {runs.length.toLocaleString()}. Click a
        trace to inspect that run.
      </p>
      <div style={{ flex: 1, minHeight: 240 }}>
        <Line
          ref={(instance) => {
            chartRef.current = instance ?? null;
          }}
          data={{ labels, datasets }}
          options={options}
        />
      </div>
    </div>
  );
}
