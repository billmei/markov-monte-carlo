import { describe, expect, test } from "bun:test";
import { runMonteCarlo } from "../simulate";
import { indexScenario, isTerminal, simulatePath } from "../markov";
import { mulberry32 } from "../rng";
import { absorbingFixture, horizonFixture } from "./fixtures";

describe("simulatePath", () => {
  test("absorbing runs always end on a terminal state", () => {
    const scenario = absorbingFixture();
    const index = indexScenario(scenario);

    for (let seed = 0; seed < 500; seed++) {
      const path = simulatePath(scenario, index, mulberry32(seed), scenario.maxSteps);
      const last = path[path.length - 1]!;
      expect(isTerminal(index, last.stateId)).toBe(true);
      expect(path.length).toBeLessThanOrEqual(scenario.maxSteps);
      expect(path[0]!.stateId).toBe("start");
    }
  });

  test("absorbing runs respect a tight maxSteps cap", () => {
    const scenario = absorbingFixture();
    const index = indexScenario(scenario);
    const path = simulatePath(scenario, index, mulberry32(1), 2);
    expect(path.length).toBeLessThanOrEqual(2);
  });

  test("horizon runs are exactly maxSteps long", () => {
    const scenario = horizonFixture();
    const index = indexScenario(scenario);

    for (let seed = 0; seed < 200; seed++) {
      const path = simulatePath(scenario, index, mulberry32(seed), scenario.maxSteps);
      expect(path.length).toBe(scenario.maxSteps);
    }
  });

  test("horizon runs hold an absorbing state for the remaining periods", () => {
    // `done` is terminal but sits inside a fixed-horizon scenario, so once a
    // run lands there it must self-loop rather than end the path early.
    const scenario = horizonFixture();
    scenario.states.push({ id: "done", label: "Done", terminal: true });
    scenario.transitions.bust = [{ to: "done", p: 1 }];
    scenario.variables[0]!.cpt.done = { up: 0, down: 1 };
    const index = indexScenario(scenario);

    const path = simulatePath(scenario, index, mulberry32(4), scenario.maxSteps);
    expect(path.length).toBe(scenario.maxSteps);

    const firstDone = path.findIndex((step) => step.stateId === "done");
    if (firstDone !== -1) {
      for (let i = firstDone; i < path.length; i++) {
        expect(path[i]!.stateId).toBe("done");
      }
    }
  });

  test("branch frequencies match the declared transition probabilities", () => {
    const scenario = absorbingFixture();
    const index = indexScenario(scenario);
    let toMiddle = 0;
    const trials = 50_000;

    for (let seed = 0; seed < trials; seed++) {
      const path = simulatePath(scenario, index, mulberry32(seed), scenario.maxSteps);
      if (path[1]?.stateId === "middle") toMiddle += 1;
    }

    expect(toMiddle / trials).toBeCloseTo(0.6, 2);
  });
});

describe("runMonteCarlo", () => {
  test("is deterministic for a given seed", () => {
    const scenario = absorbingFixture();
    const a = runMonteCarlo(scenario, { runs: 200, seed: 42 });
    const b = runMonteCarlo(scenario, { runs: 200, seed: 42 });
    expect(JSON.stringify(a.runs)).toBe(JSON.stringify(b.runs));
  });

  test("a different seed produces different runs", () => {
    const scenario = absorbingFixture();
    const a = runMonteCarlo(scenario, { runs: 200, seed: 42 });
    const b = runMonteCarlo(scenario, { runs: 200, seed: 43 });
    expect(JSON.stringify(a.runs)).not.toBe(JSON.stringify(b.runs));
  });

  test("run N is unaffected by how many runs came after it", () => {
    // Each run draws from its own derived seed, so growing the run count
    // extends the result rather than reshuffling it.
    const scenario = absorbingFixture();
    const small = runMonteCarlo(scenario, { runs: 50, seed: 11 });
    const large = runMonteCarlo(scenario, { runs: 500, seed: 11 });
    expect(JSON.stringify(large.runs.slice(0, 50))).toBe(JSON.stringify(small.runs));
  });

  test("records a step entry per hop with the probability that was taken", () => {
    const scenario = absorbingFixture();
    const { runs } = runMonteCarlo(scenario, { runs: 50, seed: 5 });

    for (const run of runs) {
      expect(run.steps.length).toBeGreaterThan(0);
      run.steps.forEach((step, i) => {
        expect(step.step).toBe(i);
        expect(step.p).toBeGreaterThan(0);
        expect(step.p).toBeLessThanOrEqual(1);
      });
      expect(run.steps[run.steps.length - 1]!.stateId).toBe(run.terminalStateId);
      expect(run.absorbed).toBe(true);
    }
  });

  test("terminal-state frequency matches the analytic probability", () => {
    // P(win) = P(start->middle) * P(middle->win) = 0.6 * 0.25 = 0.15
    const scenario = absorbingFixture();
    const { runs } = runMonteCarlo(scenario, { runs: 40_000, seed: 2024 });
    const wins = runs.filter((r) => r.terminalStateId === "win").length;
    expect(wins / runs.length).toBeCloseTo(0.15, 2);
  });
});

describe("variables", () => {
  test("a variable conditions on its parent variable's level", () => {
    // rate=low always implies downstream=calm (range 0-1);
    // rate=high always implies downstream=wild (range 5-6).
    const scenario = absorbingFixture();
    const { runs } = runMonteCarlo(scenario, { runs: 300, seed: 8 });

    for (const run of runs) {
      for (const step of run.steps) {
        const rate = step.vars.rate!;
        const downstream = step.vars.downstream!;
        expect(downstream.levelId).toBe(rate.levelId === "low" ? "calm" : "wild");
        expect(downstream.value).toBeGreaterThanOrEqual(rate.levelId === "low" ? 0 : 5);
        expect(downstream.value).toBeLessThanOrEqual(rate.levelId === "low" ? 1 : 6);
      }
    }
  });

  test("a variable conditions on the state at each step", () => {
    // The `lose` row is high:1, so every run ending on `lose` reads high there.
    const scenario = absorbingFixture();
    const { runs } = runMonteCarlo(scenario, { runs: 300, seed: 9 });

    for (const run of runs.filter((r) => r.terminalStateId === "lose")) {
      expect(run.steps[run.steps.length - 1]!.vars.rate!.levelId).toBe("high");
    }
  });

  test("throws a descriptive error when a CPT row is missing", () => {
    const scenario = absorbingFixture();
    delete scenario.variables[0]!.cpt.middle;
    expect(() => runMonteCarlo(scenario, { runs: 200, seed: 1 })).toThrow(
      /no conditional distribution for parent "middle"/,
    );
  });

  test("a wildcard row covers parent keys with no explicit row", () => {
    const scenario = absorbingFixture();
    delete scenario.variables[0]!.cpt.middle;
    scenario.variables[0]!.cpt["*"] = { low: 1, high: 0 };
    expect(() => runMonteCarlo(scenario, { runs: 200, seed: 1 })).not.toThrow();
  });
});

describe("outcomes", () => {
  test("numeric, terminal-state and category outcomes read off the final step", () => {
    const scenario = absorbingFixture();
    const { runs } = runMonteCarlo(scenario, { runs: 500, seed: 6 });

    for (const run of runs) {
      const final = run.steps[run.steps.length - 1]!;
      expect(run.outcomes.value).toBe(final.vars.downstream!.value);
      expect(run.outcomes.landing).toBe(run.terminalStateId === "win" ? "Win" : "Lose");
      expect(run.outcomes.verdict).toBe(run.terminalStateId === "win" ? "success" : "failure");
    }
  });

  test("horizon scenarios report the final period's value", () => {
    const scenario = horizonFixture();
    const { runs, maxStepCount } = runMonteCarlo(scenario, { runs: 100, seed: 3 });
    expect(maxStepCount).toBe(scenario.maxSteps);

    for (const run of runs) {
      expect(run.outcomes.growth).toBe(run.steps[scenario.maxSteps - 1]!.vars.growth!.value);
    }
  });
});
