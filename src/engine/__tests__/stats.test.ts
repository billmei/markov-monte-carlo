import { describe, expect, test } from "bun:test";
import {
  frequency,
  histogram,
  percentile,
  percentileBands,
  runSeries,
  sampleRunIndices,
  summarize,
} from "../stats";
import { runMonteCarlo } from "../simulate";
import { horizonFixture } from "./fixtures";

describe("percentile", () => {
  test("interpolates between neighbours", () => {
    const sorted = [0, 10, 20, 30, 40];
    expect(percentile(sorted, 0)).toBe(0);
    expect(percentile(sorted, 50)).toBe(20);
    expect(percentile(sorted, 100)).toBe(40);
    expect(percentile(sorted, 25)).toBe(10);
    expect(percentile(sorted, 12.5)).toBe(5);
  });

  test("handles degenerate inputs", () => {
    expect(percentile([], 50)).toBeNaN();
    expect(percentile([7], 90)).toBe(7);
  });
});

describe("summarize", () => {
  test("reports mean, sd and percentiles", () => {
    const summary = summarize([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(summary.count).toBe(8);
    expect(summary.mean).toBe(5);
    expect(summary.sd).toBe(2);
    expect(summary.min).toBe(2);
    expect(summary.max).toBe(9);
    expect(summary.p[50]).toBeCloseTo(4.5, 10);
  });

  test("ignores non-finite values", () => {
    const summary = summarize([1, Number.NaN, 3, Number.POSITIVE_INFINITY]);
    expect(summary.count).toBe(2);
    expect(summary.mean).toBe(2);
  });

  test("an empty sample is zeroed rather than NaN", () => {
    expect(summarize([]).count).toBe(0);
    expect(summarize([]).mean).toBe(0);
  });
});

describe("histogram", () => {
  test("bins span the data and preserve the total count", () => {
    const values = Array.from({ length: 1000 }, (_, i) => i / 100);
    const bins = histogram(values, 10);
    expect(bins.length).toBe(10);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(1000);
    expect(bins[0]!.x0).toBeCloseTo(0, 10);
    expect(bins[9]!.x1).toBeCloseTo(9.99, 10);
  });

  test("the maximum lands in the last bin rather than falling off the end", () => {
    const bins = histogram([0, 1, 2, 3, 4], 4);
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(5);
    expect(bins[3]!.count).toBeGreaterThan(0);
  });

  test("a constant sample yields one padded bin range", () => {
    const bins = histogram([5, 5, 5], 1);
    expect(bins.length).toBe(1);
    expect(bins[0]!.count).toBe(3);
    expect(bins[0]!.x1).toBeGreaterThan(bins[0]!.x0);
  });

  test("an empty sample yields no bins", () => {
    expect(histogram([])).toEqual([]);
  });
});

describe("frequency", () => {
  test("counts descending and computes shares, skipping nulls", () => {
    const result = frequency(["a", "b", "a", null, "a", "b"]);
    expect(result).toEqual([
      { key: "a", count: 3, share: 0.6 },
      { key: "b", count: 2, share: 0.4 },
    ]);
  });
});

describe("percentileBands", () => {
  test("produces one band per step, ordered low to high", () => {
    const scenario = horizonFixture();
    const result = runMonteCarlo(scenario, { runs: 2000, seed: 17 });
    const bands = percentileBands(result, "growth", [5, 50, 95]);

    expect(bands.length).toBe(scenario.maxSteps);
    for (const band of bands) {
      expect(band.values[5]!).toBeLessThanOrEqual(band.values[50]!);
      expect(band.values[50]!).toBeLessThanOrEqual(band.values[95]!);
      // The fixture's ranges are [-2, 0] and [1, 3].
      expect(band.values[5]!).toBeGreaterThanOrEqual(-2);
      expect(band.values[95]!).toBeLessThanOrEqual(3);
    }
  });
});

describe("runSeries", () => {
  test("returns one value per step", () => {
    const scenario = horizonFixture();
    const result = runMonteCarlo(scenario, { runs: 5, seed: 1 });
    const series = runSeries(result.runs[0]!, "growth");
    expect(series.length).toBe(scenario.maxSteps);
    expect(series.every((v) => typeof v === "number")).toBe(true);
  });

  test("an unknown variable yields nulls rather than throwing", () => {
    const result = runMonteCarlo(horizonFixture(), { runs: 1, seed: 1 });
    expect(runSeries(result.runs[0]!, "nope").every((v) => v === null)).toBe(true);
  });
});

describe("sampleRunIndices", () => {
  test("returns every index when the total fits under the limit", () => {
    expect(sampleRunIndices(4, 10)).toEqual([0, 1, 2, 3]);
  });

  test("spreads the sample across the range without duplicates", () => {
    const indices = sampleRunIndices(1000, 10);
    expect(indices.length).toBe(10);
    expect(new Set(indices).size).toBe(10);
    expect(indices[0]).toBe(0);
    expect(Math.max(...indices)).toBeLessThan(1000);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
  });

  test("is deterministic", () => {
    expect(sampleRunIndices(5000, 250)).toEqual(sampleRunIndices(5000, 250));
  });
});
