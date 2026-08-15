import type { RunResult, SimulationResult } from "./types";

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

export interface NumericSummary {
  count: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  /** Keyed by percentile, e.g. `p[50]` is the median. */
  p: Record<number, number>;
}

export interface CategoryCount {
  key: string;
  count: number;
  share: number;
}

/**
 * Linear-interpolated percentile over an ascending array.
 * `p` is expressed 0–100.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const loValue = sorted[lo]!;
  if (lo === hi) return loValue;
  return loValue + (sorted[hi]! - loValue) * (rank - lo);
}

export const DEFAULT_PERCENTILES = [5, 25, 50, 75, 95] as const;

export function summarize(
  values: number[],
  percentiles: readonly number[] = DEFAULT_PERCENTILES,
): NumericSummary {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { count: 0, mean: 0, sd: 0, min: 0, max: 0, p: {} };
  }

  const sorted = [...finite].sort((a, b) => a - b);
  const mean = finite.reduce((sum, v) => sum + v, 0) / finite.length;
  const variance =
    finite.reduce((sum, v) => sum + (v - mean) ** 2, 0) / finite.length;

  const p: Record<number, number> = {};
  for (const q of percentiles) p[q] = percentile(sorted, q);

  return {
    count: finite.length,
    mean,
    sd: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    p,
  };
}

/** Equal-width bins spanning the data. A degenerate range yields one bin. */
export function histogram(values: number[], binCount = 30): HistogramBin[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [];

  const bins = Math.max(1, Math.floor(binCount));
  let min = Math.min(...finite);
  let max = Math.max(...finite);

  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 0.5;
    min -= pad;
    max += pad;
  }

  const width = (max - min) / bins;
  const result: HistogramBin[] = Array.from({ length: bins }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
  }));

  for (const v of finite) {
    // The top edge is inclusive so the maximum lands in the last bin.
    const raw = Math.floor((v - min) / width);
    const idx = Math.min(bins - 1, Math.max(0, raw));
    result[idx]!.count += 1;
  }

  return result;
}

/** Counts occurrences, descending by count. */
export function frequency(values: Array<string | null>): CategoryCount[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const value of values) {
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    total += 1;
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** One run's values for a variable, step by step. Missing steps become null. */
export function runSeries(run: RunResult, variableId: string): Array<number | null> {
  return run.steps.map((step) => step.vars[variableId]?.value ?? null);
}

export interface PercentileBand {
  step: number;
  values: Record<number, number>;
}

/**
 * Percentile bands across *all* runs at each step.
 *
 * The trace chart draws only a sampled subset of runs (Chart.js will not render
 * thousands of datasets smoothly), so these bands carry the exact shape of the
 * full population alongside the sample.
 */
export function percentileBands(
  result: SimulationResult,
  variableId: string,
  percentiles: readonly number[] = [5, 50, 95],
): PercentileBand[] {
  const bands: PercentileBand[] = [];

  for (let step = 0; step < result.maxStepCount; step++) {
    const column: number[] = [];
    for (const run of result.runs) {
      const value = run.steps[step]?.vars[variableId]?.value;
      if (typeof value === "number" && Number.isFinite(value)) column.push(value);
    }
    if (column.length === 0) continue;

    column.sort((a, b) => a - b);
    const values: Record<number, number> = {};
    for (const q of percentiles) values[q] = percentile(column, q);
    bands.push({ step, values });
  }

  return bands;
}

/**
 * Evenly spaced sample of run indices, deterministic for a given
 * `(total, limit)` pair so the trace chart stays stable across re-renders.
 */
export function sampleRunIndices(total: number, limit: number): number[] {
  if (total <= limit) return Array.from({ length: total }, (_, i) => i);
  const stride = total / limit;
  const indices: number[] = [];
  for (let i = 0; i < limit; i++) {
    indices.push(Math.min(total - 1, Math.floor(i * stride)));
  }
  return indices;
}
