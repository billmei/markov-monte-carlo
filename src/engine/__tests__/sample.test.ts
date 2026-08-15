import { describe, expect, test } from "bun:test";
import { mulberry32 } from "../rng";
import { normalizeEntries, normalizeRecord, sampleEntry, sampleRange } from "../sample";

describe("normalizeEntries", () => {
  test("scales weights to sum to 1", () => {
    const result = normalizeEntries([
      { id: "a", weight: 3 },
      { id: "b", weight: 1 },
    ]);
    expect(result.map((e) => e.weight)).toEqual([0.75, 0.25]);
  });

  test("clamps negative and non-finite weights to zero", () => {
    const result = normalizeEntries([
      { id: "a", weight: -5 },
      { id: "b", weight: Number.NaN },
      { id: "c", weight: 2 },
    ]);
    expect(result).toEqual([
      { id: "a", weight: 0 },
      { id: "b", weight: 0 },
      { id: "c", weight: 1 },
    ]);
  });

  test("falls back to uniform when every weight is zero", () => {
    // Keeps the UI usable while a slider is dragged to the bottom mid-edit.
    const result = normalizeEntries([
      { id: "a", weight: 0 },
      { id: "b", weight: 0 },
    ]);
    expect(result.map((e) => e.weight)).toEqual([0.5, 0.5]);
  });

  test("returns an empty array unchanged", () => {
    expect(normalizeEntries([])).toEqual([]);
  });
});

describe("sampleEntry", () => {
  test("observed frequencies converge on the declared probabilities", () => {
    const distribution = normalizeRecord({ a: 0.6, b: 0.3, c: 0.1 });
    const rng = mulberry32(12345);
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };

    const draws = 200_000;
    for (let i = 0; i < draws; i++) {
      counts[sampleEntry(distribution, rng).id]! += 1;
    }

    expect(counts.a! / draws).toBeCloseTo(0.6, 2);
    expect(counts.b! / draws).toBeCloseTo(0.3, 2);
    expect(counts.c! / draws).toBeCloseTo(0.1, 2);
  });

  test("never returns a zero-weight entry", () => {
    const distribution = normalizeRecord({ never: 0, always: 1 });
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      expect(sampleEntry(distribution, rng).id).toBe("always");
    }
  });

  test("throws on an empty distribution", () => {
    expect(() => sampleEntry([], mulberry32(1))).toThrow(/empty distribution/);
  });
});

describe("sampleRange", () => {
  test("stays within the interval and tolerates a reversed range", () => {
    const rng = mulberry32(2024);
    for (let i = 0; i < 1000; i++) {
      const forward = sampleRange([2, 8], rng);
      expect(forward).toBeGreaterThanOrEqual(2);
      expect(forward).toBeLessThanOrEqual(8);

      const reversed = sampleRange([8, 2], rng);
      expect(reversed).toBeGreaterThanOrEqual(2);
      expect(reversed).toBeLessThanOrEqual(8);
    }
  });

  test("a zero-width range is constant", () => {
    expect(sampleRange([4, 4], mulberry32(1))).toBe(4);
  });
});
