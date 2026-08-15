import { describe, expect, test } from "bun:test";
import { applyEdits, countEdits, emptyOverlay, isOverlayEmpty } from "../edits";
import { absorbingFixture } from "@/engine/__tests__/fixtures";
import { runMonteCarlo, validateScenario } from "@/engine";

describe("applyEdits", () => {
  test("an empty overlay leaves the scenario unchanged", () => {
    const base = absorbingFixture();
    expect(applyEdits(base, emptyOverlay())).toEqual(base);
  });

  test("substitutes an edited transition distribution", () => {
    const base = absorbingFixture();
    const merged = applyEdits(base, {
      ...emptyOverlay(),
      transitions: { start: { middle: 0.9, lose: 0.1 } },
    });

    expect(merged.transitions.start).toEqual([
      { to: "middle", p: 0.9 },
      { to: "lose", p: 0.1 },
    ]);
    // Untouched distributions and the base object itself are left alone.
    expect(merged.transitions.middle).toBe(base.transitions.middle);
    expect(base.transitions.start![0]!.p).toBe(0.6);
  });

  test("substitutes an edited CPT row without disturbing its siblings", () => {
    const base = absorbingFixture();
    const merged = applyEdits(base, {
      ...emptyOverlay(),
      cpts: { rate: { middle: { low: 0.2, high: 0.8 } } },
    });

    expect(merged.variables[0]!.cpt.middle).toEqual({ low: 0.2, high: 0.8 });
    expect(merged.variables[0]!.cpt.start).toEqual({ low: 1, high: 0 });
    expect(merged.variables[1]).toBe(base.variables[1]!);
  });

  test("substitutes edited start weights", () => {
    const base = absorbingFixture();
    base.initial = { start: 0.5, middle: 0.5 };
    const merged = applyEdits(base, {
      ...emptyOverlay(),
      initial: { start: 0.9, middle: 0.1 },
    });
    expect(merged.initial).toEqual({ start: 0.9, middle: 0.1 });
  });

  test("ignores overlay entries that do not exist in the scenario", () => {
    // A stale overlay must never corrupt a newly loaded scenario.
    const base = absorbingFixture();
    const merged = applyEdits(base, {
      transitions: { ghostState: { nowhere: 1 } },
      cpts: { ghostVariable: { anything: { x: 1 } } },
      initial: { ghostState: 1 },
    });
    expect(merged.transitions).toEqual(base.transitions);
    expect(merged.variables).toEqual(base.variables);
    expect(merged.initial).toEqual(base.initial);
  });

  test("the merged scenario is still valid and still simulates", () => {
    const base = absorbingFixture();
    const merged = applyEdits(base, {
      ...emptyOverlay(),
      transitions: { start: { middle: 0.95, lose: 0.05 } },
    });

    expect(validateScenario(merged).ok).toBe(true);

    const { runs } = runMonteCarlo(merged, { runs: 20_000, seed: 3 });
    const viaMiddle = runs.filter((r) => r.steps[1]?.stateId === "middle").length;
    expect(viaMiddle / runs.length).toBeCloseTo(0.95, 2);
  });
});

describe("overlay bookkeeping", () => {
  test("isOverlayEmpty tracks whether anything was touched", () => {
    expect(isOverlayEmpty(emptyOverlay())).toBe(true);
    expect(
      isOverlayEmpty({ ...emptyOverlay(), transitions: { start: { middle: 1 } } }),
    ).toBe(false);
  });

  test("countEdits counts touched distributions", () => {
    expect(countEdits(emptyOverlay())).toBe(0);
    expect(
      countEdits({
        transitions: { start: { middle: 1 }, seed: { a: 1 } },
        cpts: { rate: { start: { low: 1 }, middle: { low: 1 } } },
        initial: { start: 1 },
      }),
    ).toBe(5);
  });
});
