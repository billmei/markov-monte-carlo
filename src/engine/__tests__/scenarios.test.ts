import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { runMonteCarlo } from "../simulate";
import { buildAnalyticFlow, buildFlowFromRuns } from "../sankey";
import { validateScenario } from "../schema";
import type { Scenario } from "../types";

/**
 * Guards the bundled scenario files in the top-level `scenarios/` directory.
 *
 * `src/scenarios.ts` discovers them with Vite's `import.meta.glob`, which bun
 * test cannot evaluate, so this walks the directory directly — which also means
 * a newly added scenario file is covered here automatically.
 */
const dir = join(import.meta.dir, "..", "..", "..", "scenarios");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

test("the bundled scenario directory is not empty", () => {
  expect(files.length).toBeGreaterThan(0);
});

describe.each(files)("%s", (file) => {
  const load = async (): Promise<Scenario> => {
    const raw = await Bun.file(join(dir, file)).json();
    const result = validateScenario(raw);
    if (!result.ok) {
      const detail = result.issues.map((i) => `  ${i.path}: ${i.message}`).join("\n");
      throw new Error(`${file} failed validation:\n${detail}`);
    }
    return result.scenario;
  };

  test("validates against the schema", async () => {
    await expect(load()).resolves.toBeDefined();
  });

  test("simulates without throwing and fills every declared outcome", async () => {
    const scenario = await load();
    const result = runMonteCarlo(scenario, { runs: 500, seed: scenario.seed ?? 1 });

    expect(result.runs.length).toBe(500);
    for (const run of result.runs) {
      for (const spec of scenario.outcomes) {
        const value = run.outcomes[spec.id];
        expect(value).not.toBeUndefined();
        expect(value).not.toBeNull();
        if (spec.kind === "numeric") {
          expect(Number.isFinite(value as number)).toBe(true);
        } else {
          expect(typeof value).toBe("string");
        }
      }
    }
  });

  test("respects its declared chain mode", async () => {
    const scenario = await load();
    const { runs } = runMonteCarlo(scenario, { runs: 300, seed: 99 });

    for (const run of runs) {
      if (scenario.mode === "horizon") {
        expect(run.steps.length).toBe(scenario.maxSteps);
      } else {
        expect(run.steps.length).toBeLessThanOrEqual(scenario.maxSteps);
        expect(run.absorbed).toBe(true);
      }
    }
  });

  test("every state and variable carries author notes", async () => {
    // The tooltip feature is only discoverable if the shipped examples use it.
    const scenario = await load();
    for (const state of scenario.states) {
      expect(state.notes?.trim().length ?? 0).toBeGreaterThan(0);
    }
    for (const variable of scenario.variables) {
      expect(variable.notes?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  test("builds both flow graphs", async () => {
    const scenario = await load();
    const result = runMonteCarlo(scenario, { runs: 200, seed: 4 });

    const sampled = buildFlowFromRuns(scenario, result);
    expect(sampled.nodes.length).toBeGreaterThan(0);
    expect(sampled.links.length).toBeGreaterThan(0);

    const analytic = buildAnalyticFlow(scenario);
    expect(analytic.nodes.length).toBeGreaterThan(0);
    expect(analytic.links.length).toBeGreaterThan(0);
  });

  test("declares at least one numeric and one categorical outcome", async () => {
    const scenario = await load();
    expect(scenario.outcomes.some((o) => o.kind === "numeric")).toBe(true);
    expect(scenario.outcomes.some((o) => o.kind === "categorical")).toBe(true);
  });
});
