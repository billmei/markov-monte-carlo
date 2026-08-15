import { indexScenario, isTerminal, type ScenarioIndex } from "./markov";
import type { Scenario, SimulationResult } from "./types";

export interface FlowNode {
  /** Unique key: `stateId@step` when time-expanded, otherwise `stateId`. */
  key: string;
  stateId: string;
  /** Step column; -1 in collapsed mode where a state occupies a single node. */
  step: number;
  label: string;
  /** Mass flowing through: run count, or probability in the analytic variant. */
  value: number;
}

export interface FlowLink {
  source: string;
  target: string;
  fromStateId: string;
  toStateId: string;
  step: number;
  value: number;
  /** Share of the source node's mass taking this link. */
  share: number;
}

export interface FlowGraph {
  nodes: FlowNode[];
  links: FlowLink[];
  stepCount: number;
  /** Total mass entering at step 0 — the run count, or 1.0 for the analytic graph. */
  total: number;
  /**
   * Whether the collapsed (state-only) projection is acyclic. `d3-sankey`
   * requires a DAG, so the UI disables the collapse toggle when this is false.
   */
  collapsible: boolean;
}

interface FlowAccumulator {
  nodeValues: Map<string, number>;
  linkValues: Map<string, number>;
}

function linkKey(from: string, to: string, step: number): string {
  return `${from}->${to}@${step}`;
}

/**
 * Detects whether the state-only projection of the links contains a cycle.
 * A `horizon` scenario that revisits states does; a layered funnel does not.
 */
function isCollapsible(links: Array<{ fromStateId: string; toStateId: string }>): boolean {
  const adjacency = new Map<string, Set<string>>();
  for (const link of links) {
    if (link.fromStateId === link.toStateId) return false; // self-loop
    let targets = adjacency.get(link.fromStateId);
    if (!targets) {
      targets = new Set();
      adjacency.set(link.fromStateId, targets);
    }
    targets.add(link.toStateId);
  }

  const VISITING = 1;
  const DONE = 2;
  const marks = new Map<string, number>();

  const visit = (node: string): boolean => {
    const mark = marks.get(node);
    if (mark === VISITING) return false;
    if (mark === DONE) return true;
    marks.set(node, VISITING);
    for (const next of adjacency.get(node) ?? []) {
      if (!visit(next)) return false;
    }
    marks.set(node, DONE);
    return true;
  };

  for (const node of adjacency.keys()) {
    if (!visit(node)) return false;
  }
  return true;
}

function materialize(
  accumulator: FlowAccumulator,
  index: ScenarioIndex,
  expanded: boolean,
  stepCount: number,
  total: number,
): FlowGraph {
  const nodes: FlowNode[] = [...accumulator.nodeValues.entries()].map(
    ([key, value]) => {
      const [stateId, stepPart] = expanded ? key.split("@") : [key, undefined];
      const id = stateId!;
      return {
        key,
        stateId: id,
        step: stepPart === undefined ? -1 : Number(stepPart),
        label: index.states.get(id)?.label ?? id,
        value,
      };
    },
  );

  const links: FlowLink[] = [...accumulator.linkValues.entries()].map(
    ([key, value]) => {
      const [edge, stepPart] = key.split("@");
      const [fromStateId, toStateId] = edge!.split("->") as [string, string];
      const step = Number(stepPart);
      const sourceKey = expanded ? `${fromStateId}@${step}` : fromStateId;
      const targetKey = expanded ? `${toStateId}@${step + 1}` : toStateId;
      const sourceValue = accumulator.nodeValues.get(sourceKey) ?? 0;
      return {
        source: sourceKey,
        target: targetKey,
        fromStateId,
        toStateId,
        step,
        value,
        share: sourceValue > 0 ? value / sourceValue : 0,
      };
    },
  );

  // Collapsed graphs merge parallel edges across steps into one.
  const merged = expanded ? links : mergeParallelLinks(links);

  return {
    nodes,
    links: merged,
    stepCount,
    total,
    collapsible: isCollapsible(merged),
  };
}

function mergeParallelLinks(links: FlowLink[]): FlowLink[] {
  const byEdge = new Map<string, FlowLink>();
  for (const link of links) {
    const key = `${link.fromStateId}->${link.toStateId}`;
    const existing = byEdge.get(key);
    if (existing) {
      existing.value += link.value;
      existing.step = Math.min(existing.step, link.step);
    } else {
      byEdge.set(key, { ...link });
    }
  }
  return [...byEdge.values()];
}

/**
 * Aggregates observed run paths into a flow graph.
 *
 * Nodes are `(stateId, step)` pairs by default. Time-expanding this way keeps
 * the graph acyclic even when the chain revisits states, which is what makes a
 * Sankey layout possible for `horizon` scenarios at all.
 */
export function buildFlowFromRuns(
  scenario: Scenario,
  result: SimulationResult,
  options: { expanded?: boolean } = {},
): FlowGraph {
  const expanded = options.expanded ?? true;
  const index = indexScenario(scenario);
  const accumulator: FlowAccumulator = {
    nodeValues: new Map(),
    linkValues: new Map(),
  };

  const bump = (map: Map<string, number>, key: string, amount: number) => {
    map.set(key, (map.get(key) ?? 0) + amount);
  };

  for (const run of result.runs) {
    for (let i = 0; i < run.steps.length; i++) {
      const step = run.steps[i]!;
      bump(
        accumulator.nodeValues,
        expanded ? `${step.stateId}@${i}` : step.stateId,
        1,
      );
      const next = run.steps[i + 1];
      if (next) {
        bump(accumulator.linkValues, linkKey(step.stateId, next.stateId, i), 1);
      }
    }
  }

  return materialize(
    accumulator,
    index,
    expanded,
    result.maxStepCount,
    result.runs.length,
  );
}

/**
 * Propagates probability mass analytically, with no sampling. Used to render
 * the diagram before the first simulation and to show declared probabilities
 * rather than sampled ones.
 */
export function buildAnalyticFlow(
  scenario: Scenario,
  options: { expanded?: boolean; maxSteps?: number } = {},
): FlowGraph {
  const expanded = options.expanded ?? true;
  const index = indexScenario(scenario);
  const steps = Math.max(1, Math.floor(options.maxSteps ?? scenario.maxSteps));

  const accumulator: FlowAccumulator = {
    nodeValues: new Map(),
    linkValues: new Map(),
  };

  const bump = (map: Map<string, number>, key: string, amount: number) => {
    map.set(key, (map.get(key) ?? 0) + amount);
  };

  // Mass currently sitting on each state at the step being processed.
  let frontier = new Map<string, number>();
  for (const entry of index.initial) {
    frontier.set(entry.id, (frontier.get(entry.id) ?? 0) + entry.weight);
  }

  for (let step = 0; step < steps; step++) {
    for (const [stateId, mass] of frontier) {
      bump(accumulator.nodeValues, expanded ? `${stateId}@${step}` : stateId, mass);
    }
    if (step === steps - 1) break;

    const next = new Map<string, number>();
    for (const [stateId, mass] of frontier) {
      if (mass <= 0) continue;

      if (isTerminal(index, stateId)) {
        // Absorbing runs stop here; horizon runs hold the state.
        if (scenario.mode === "horizon") {
          bump(accumulator.linkValues, linkKey(stateId, stateId, step), mass);
          next.set(stateId, (next.get(stateId) ?? 0) + mass);
        }
        continue;
      }

      for (const edge of index.outgoing.get(stateId) ?? []) {
        const flow = mass * edge.weight;
        if (flow <= 0) continue;
        bump(accumulator.linkValues, linkKey(stateId, edge.id, step), flow);
        next.set(edge.id, (next.get(edge.id) ?? 0) + flow);
      }
    }

    if (next.size === 0) break;
    frontier = next;
  }

  return materialize(accumulator, index, expanded, steps, 1);
}
