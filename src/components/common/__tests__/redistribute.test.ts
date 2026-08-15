import { describe, expect, test } from "bun:test";
import { redistribute, toPercentages, toWeights } from "../redistribute";

const sum = (values: Record<string, number>) =>
  Math.round(Object.values(values).reduce((a, b) => a + b, 0) * 10) / 10;

describe("redistribute", () => {
  test("holds the edited value and rebalances the rest to 100", () => {
    const result = redistribute({
      values: { a: 60, b: 30, c: 10 },
      changedId: "a",
      nextValue: 80,
    });
    expect(result.a).toBe(80);
    expect(sum(result)).toBe(100);
  });

  test("preserves the ratio between untouched branches", () => {
    // b:c was 3:1 before the edit and must stay 3:1 after it.
    const result = redistribute({
      values: { a: 60, b: 30, c: 10 },
      changedId: "a",
      nextValue: 20,
    });
    expect(result.a).toBe(20);
    expect(result.b! / result.c!).toBeCloseTo(3, 5);
    expect(sum(result)).toBe(100);
  });

  test("locked rows keep their exact value", () => {
    const result = redistribute({
      values: { a: 50, b: 30, c: 20 },
      changedId: "a",
      nextValue: 10,
      locked: new Set(["b"]),
    });
    expect(result.a).toBe(10);
    expect(result.b).toBe(30);
    expect(result.c).toBe(60);
    expect(sum(result)).toBe(100);
  });

  test("the edited value is capped by the locked headroom", () => {
    const result = redistribute({
      values: { a: 20, b: 70, c: 10 },
      changedId: "a",
      nextValue: 90,
      locked: new Set(["b"]),
    });
    expect(result.a).toBe(30); // 100 - 70 locked
    expect(result.b).toBe(70);
    expect(result.c).toBe(0);
    expect(sum(result)).toBe(100);
  });

  test("when everything else is locked the edited row absorbs the remainder", () => {
    const result = redistribute({
      values: { a: 10, b: 60, c: 25 },
      changedId: "a",
      nextValue: 99,
      locked: new Set(["b", "c"]),
    });
    expect(result).toEqual({ b: 60, c: 25, a: 15 });
  });

  test("splits evenly when the untouched rows are all zero", () => {
    const result = redistribute({
      values: { a: 100, b: 0, c: 0 },
      changedId: "a",
      nextValue: 40,
    });
    expect(result.a).toBe(40);
    expect(result.b).toBe(30);
    expect(result.c).toBe(30);
  });

  test("clamps a negative or over-large request", () => {
    expect(redistribute({ values: { a: 50, b: 50 }, changedId: "a", nextValue: -20 }).a).toBe(0);
    expect(redistribute({ values: { a: 50, b: 50 }, changedId: "a", nextValue: 400 }).a).toBe(100);
  });

  test("a single-branch distribution is always 100", () => {
    expect(redistribute({ values: { only: 42 }, changedId: "only", nextValue: 10 })).toEqual({
      only: 100,
    });
  });

  test("always totals exactly 100, including awkward thirds", () => {
    const result = redistribute({
      values: { a: 33.3, b: 33.3, c: 33.4 },
      changedId: "a",
      nextValue: 10,
    });
    expect(sum(result)).toBe(100);
  });
});

describe("toPercentages / toWeights", () => {
  test("scales engine weights to percentages summing to 100", () => {
    expect(toPercentages({ a: 0.6, b: 0.3, c: 0.1 })).toEqual({ a: 60, b: 30, c: 10 });
    expect(sum(toPercentages({ a: 3, b: 1 }))).toBe(100);
  });

  test("an all-zero distribution becomes uniform rather than NaN", () => {
    expect(toPercentages({ a: 0, b: 0 })).toEqual({ a: 50, b: 50 });
  });

  test("round-trips back to weights", () => {
    const weights = toWeights(toPercentages({ a: 0.25, b: 0.75 }));
    expect(weights.a).toBeCloseTo(0.25, 6);
    expect(weights.b).toBeCloseTo(0.75, 6);
  });
});
