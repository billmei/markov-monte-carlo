import { describe, expect, test } from "bun:test";
import { buildAnalyticFlow, buildFlowFromRuns } from "../sankey";
import { runMonteCarlo } from "../simulate";
import { absorbingFixture, horizonFixture } from "./fixtures";

describe("buildFlowFromRuns", () => {
  test("every run is accounted for at step 0", () => {
    const scenario = absorbingFixture();
    const result = runMonteCarlo(scenario, { runs: 5000, seed: 21 });
    const flow = buildFlowFromRuns(scenario, result);

    const stepZero = flow.nodes.filter((n) => n.step === 0);
    expect(stepZero.reduce((sum, n) => sum + n.value, 0)).toBe(5000);
    expect(flow.total).toBe(5000);
  });

  test("a node's outgoing links never exceed the mass flowing into it", () => {
    // Absorbing runs stop at terminal states, so outflow can be less than
    // inflow — but never more.
    const scenario = absorbingFixture();
    const result = runMonteCarlo(scenario, { runs: 3000, seed: 22 });
    const flow = buildFlowFromRuns(scenario, result);

    for (const node of flow.nodes) {
      const outflow = flow.links
        .filter((l) => l.source === node.key)
        .reduce((sum, l) => sum + l.value, 0);
      expect(outflow).toBeLessThanOrEqual(node.value);
    }
  });

  test("horizon flows conserve mass at every step", () => {
    const scenario = horizonFixture();
    const result = runMonteCarlo(scenario, { runs: 2000, seed: 23 });
    const flow = buildFlowFromRuns(scenario, result);

    for (let step = 0; step < scenario.maxSteps; step++) {
      const mass = flow.nodes
        .filter((n) => n.step === step)
        .reduce((sum, n) => sum + n.value, 0);
      expect(mass).toBe(2000);
    }
  });

  test("link shares approximate the declared transition probabilities", () => {
    const scenario = absorbingFixture();
    const result = runMonteCarlo(scenario, { runs: 40_000, seed: 24 });
    const flow = buildFlowFromRuns(scenario, result);

    const startToMiddle = flow.links.find(
      (l) => l.fromStateId === "start" && l.toStateId === "middle" && l.step === 0,
    );
    expect(startToMiddle?.share).toBeCloseTo(0.6, 2);
  });

  test("time-expanded nodes are keyed by state and step", () => {
    const scenario = horizonFixture();
    const result = runMonteCarlo(scenario, { runs: 100, seed: 25 });
    const flow = buildFlowFromRuns(scenario, result);

    for (const node of flow.nodes) {
      expect(node.key).toBe(`${node.stateId}@${node.step}`);
    }
    // Expanding by step keeps the graph itself acyclic no matter how the chain
    // recurs — a link at step k always points into column k+1.
    for (const link of flow.links) {
      const target = flow.nodes.find((n) => n.key === link.target);
      expect(target!.step).toBe(link.step + 1);
    }
    // `collapsible` reports on the state-only projection, which this recurrent
    // chain fails, so the UI keeps the collapse toggle disabled here.
    expect(flow.collapsible).toBe(false);
  });

  test("a recurrent chain is not collapsible, a funnel is", () => {
    const horizon = horizonFixture();
    const horizonFlow = buildFlowFromRuns(
      horizon,
      runMonteCarlo(horizon, { runs: 500, seed: 26 }),
      { expanded: false },
    );
    expect(horizonFlow.collapsible).toBe(false);

    const funnel = absorbingFixture();
    const funnelFlow = buildFlowFromRuns(
      funnel,
      runMonteCarlo(funnel, { runs: 500, seed: 26 }),
      { expanded: false },
    );
    expect(funnelFlow.collapsible).toBe(true);
    expect(funnelFlow.nodes.every((n) => n.step === -1)).toBe(true);
  });
});

describe("buildAnalyticFlow", () => {
  test("propagates exactly 1.0 of probability mass from the start", () => {
    const flow = buildAnalyticFlow(absorbingFixture());
    const stepZero = flow.nodes.filter((n) => n.step === 0);
    expect(stepZero.reduce((sum, n) => sum + n.value, 0)).toBeCloseTo(1, 10);
    expect(flow.total).toBe(1);
  });

  test("matches the sampled flow within Monte Carlo error", () => {
    const scenario = absorbingFixture();
    const sampled = buildFlowFromRuns(
      scenario,
      runMonteCarlo(scenario, { runs: 60_000, seed: 27 }),
    );
    const analytic = buildAnalyticFlow(scenario);

    for (const link of analytic.links) {
      const match = sampled.links.find(
        (l) =>
          l.fromStateId === link.fromStateId &&
          l.toStateId === link.toStateId &&
          l.step === link.step,
      );
      expect(match).toBeDefined();
      expect(match!.value / sampled.total).toBeCloseTo(link.value, 2);
    }
  });

  test("horizon mode keeps full mass in every column", () => {
    const scenario = horizonFixture();
    const flow = buildAnalyticFlow(scenario);

    for (let step = 0; step < scenario.maxSteps; step++) {
      const mass = flow.nodes
        .filter((n) => n.step === step)
        .reduce((sum, n) => sum + n.value, 0);
      expect(mass).toBeCloseTo(1, 10);
    }
  });

  test("absorbing mode drains mass as runs terminate", () => {
    const scenario = absorbingFixture();
    const flow = buildAnalyticFlow(scenario);
    const massAt = (step: number) =>
      flow.nodes.filter((n) => n.step === step).reduce((sum, n) => sum + n.value, 0);

    expect(massAt(0)).toBeCloseTo(1, 10);
    // 0.4 lands on `lose` at step 1 and stops, leaving 0.6 to continue.
    expect(massAt(2)).toBeCloseTo(0.6, 10);
  });
});
