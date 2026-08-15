import { describe, expect, test } from "bun:test";
import { parseScenarioJson, validateScenario } from "../schema";
import { absorbingFixture, horizonFixture } from "./fixtures";

function expectIssue(input: unknown, pattern: RegExp): void {
  const result = validateScenario(input);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  const combined = result.issues.map((i) => `${i.path}: ${i.message}`).join("\n");
  expect(combined).toMatch(pattern);
}

describe("validateScenario", () => {
  test("accepts the bundled fixtures", () => {
    expect(validateScenario(absorbingFixture()).ok).toBe(true);
    expect(validateScenario(horizonFixture()).ok).toBe(true);
  });

  test("rejects structurally malformed input", () => {
    expectIssue({}, /Required|Invalid input/i);
    expectIssue({ ...absorbingFixture(), mode: "sideways" }, /mode/);
    expectIssue({ ...absorbingFixture(), maxSteps: 0 }, /maxSteps/);
    expectIssue({ ...absorbingFixture(), states: [] }, /at least one state/);
    expectIssue({ ...absorbingFixture(), outcomes: [] }, /at least one outcome/);
  });

  test("rejects duplicate state ids", () => {
    const scenario = absorbingFixture();
    scenario.states.push({ id: "start", label: "Start again" });
    expectIssue(scenario, /duplicate state id "start"/);
  });

  test("rejects transitions pointing at unknown states", () => {
    const scenario = absorbingFixture();
    scenario.transitions.start![0]!.to = "nowhere";
    expectIssue(scenario, /unknown target state "nowhere"/);
  });

  test("rejects a start state that does not exist", () => {
    const scenario = absorbingFixture();
    scenario.initial = { ghost: 1 };
    expectIssue(scenario, /unknown state "ghost"/);
  });

  test("rejects outgoing transitions on a terminal state", () => {
    const scenario = absorbingFixture();
    scenario.transitions.win = [{ to: "lose", p: 1 }];
    expectIssue(scenario, /marked terminal but declares outgoing transitions/);
  });

  test("rejects a duplicate transition target", () => {
    const scenario = absorbingFixture();
    scenario.transitions.start!.push({ to: "middle", p: 0.1 });
    expectIssue(scenario, /duplicate transition to "middle"/);
  });

  test("rejects a distribution that sums to zero", () => {
    const scenario = absorbingFixture();
    scenario.transitions.start = [
      { to: "middle", p: 0 },
      { to: "lose", p: 0 },
    ];
    expectIssue(scenario, /all outgoing probabilities are zero/);
  });

  test("rejects a CPT that does not cover every parent value", () => {
    const scenario = absorbingFixture();
    delete scenario.variables[0]!.cpt.middle;
    expectIssue(scenario, /missing conditional rows for: middle/);
  });

  test("accepts an incomplete CPT when a wildcard row is present", () => {
    const scenario = absorbingFixture();
    delete scenario.variables[0]!.cpt.middle;
    scenario.variables[0]!.cpt["*"] = { low: 1, high: 1 };
    expect(validateScenario(scenario).ok).toBe(true);
  });

  test("rejects a CPT row keyed by an invalid parent value", () => {
    const scenario = absorbingFixture();
    scenario.variables[1]!.cpt.bogus = { calm: 1, wild: 0 };
    expectIssue(scenario, /"bogus" is not a valid value of parent "rate"/);
  });

  test("rejects a CPT row referencing an undeclared level", () => {
    const scenario = absorbingFixture();
    scenario.variables[0]!.cpt.start = { low: 1, sideways: 1 };
    expectIssue(scenario, /unknown level "sideways"/);
  });

  test("rejects a variable whose parent is declared after it", () => {
    // Declaration order fixes the causal order, which makes a dependency
    // cycle impossible to express in the first place.
    const scenario = absorbingFixture();
    scenario.variables.reverse();
    expectIssue(scenario, /must be "\$state" or a variable declared before this one/);
  });

  test("rejects an outcome pointing at an unknown variable", () => {
    const scenario = absorbingFixture();
    scenario.outcomes[0]!.source = { type: "variable", variableId: "missing" };
    expectIssue(scenario, /unknown variable "missing"/);
  });

  test("rejects a numeric outcome backed by a categorical source", () => {
    const scenario = absorbingFixture();
    scenario.outcomes[0]!.source = { type: "terminalState" };
    expectIssue(scenario, /numeric outcomes require a source of type "variable"/);
  });

  test("rejects a numeric outcome on a variable with no numeric ranges", () => {
    const scenario = absorbingFixture();
    for (const level of scenario.variables[1]!.levels) delete level.range;
    expectIssue(scenario, /has no numeric ranges/);
  });

  test("warns when an absorbing scenario can never terminate", () => {
    const scenario = horizonFixture();
    const result = validateScenario({ ...scenario, mode: "absorbing" });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.message).join()).toMatch(
      /no terminal or dead-end state/,
    );
  });
});

describe("parseScenarioJson", () => {
  test("round-trips a valid scenario", () => {
    const result = parseScenarioJson(JSON.stringify(absorbingFixture()));
    expect(result.ok).toBe(true);
  });

  test("reports a syntax error against the file rather than throwing", () => {
    const result = parseScenarioJson("{ not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.path).toBe("(file)");
    expect(result.issues[0]!.message).toMatch(/invalid JSON/);
  });
});
