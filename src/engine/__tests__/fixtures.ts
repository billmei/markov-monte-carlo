import type { Scenario } from "../types";

/** Two-branch funnel ending in tagged terminal states. */
export function absorbingFixture(): Scenario {
  return {
    id: "fixture-absorbing",
    name: "Absorbing fixture",
    mode: "absorbing",
    maxSteps: 10,
    seed: 7,
    states: [
      { id: "start", label: "Start" },
      { id: "middle", label: "Middle" },
      { id: "win", label: "Win", terminal: true, category: "success" },
      { id: "lose", label: "Lose", terminal: true, category: "failure" },
    ],
    initial: { start: 1 },
    transitions: {
      start: [
        { to: "middle", p: 0.6 },
        { to: "lose", p: 0.4 },
      ],
      middle: [
        { to: "win", p: 0.25 },
        { to: "lose", p: 0.75 },
      ],
    },
    variables: [
      {
        id: "rate",
        label: "Rate",
        parent: "$state",
        levels: [
          { id: "low", label: "Low", range: [0, 2] },
          { id: "high", label: "High", range: [8, 10] },
        ],
        cpt: {
          start: { low: 1, high: 0 },
          middle: { low: 0.5, high: 0.5 },
          win: { low: 1, high: 0 },
          lose: { low: 0, high: 1 },
        },
      },
      {
        id: "downstream",
        label: "Downstream",
        parent: "rate",
        levels: [
          { id: "calm", label: "Calm", range: [0, 1] },
          { id: "wild", label: "Wild", range: [5, 6] },
        ],
        cpt: {
          low: { calm: 1, wild: 0 },
          high: { calm: 0, wild: 1 },
        },
      },
    ],
    outcomes: [
      {
        id: "value",
        label: "Downstream value",
        kind: "numeric",
        source: { type: "variable", variableId: "downstream" },
      },
      { id: "landing", label: "Landing", kind: "categorical", source: { type: "terminalState" } },
      { id: "verdict", label: "Verdict", kind: "categorical", source: { type: "stateCategory" } },
    ],
  };
}

/** Recurrent two-state chain, exercising cycles and fixed-length runs. */
export function horizonFixture(): Scenario {
  return {
    id: "fixture-horizon",
    name: "Horizon fixture",
    mode: "horizon",
    maxSteps: 5,
    seed: 3,
    states: [
      { id: "boom", label: "Boom" },
      { id: "bust", label: "Bust" },
    ],
    initial: { boom: 1 },
    transitions: {
      boom: [
        { to: "boom", p: 0.7 },
        { to: "bust", p: 0.3 },
      ],
      bust: [
        { to: "boom", p: 0.4 },
        { to: "bust", p: 0.6 },
      ],
    },
    variables: [
      {
        id: "growth",
        label: "Growth",
        parent: "$state",
        unit: "%",
        levels: [
          { id: "up", label: "Up", range: [1, 3] },
          { id: "down", label: "Down", range: [-2, 0] },
        ],
        cpt: {
          boom: { up: 0.9, down: 0.1 },
          bust: { up: 0.2, down: 0.8 },
        },
      },
    ],
    outcomes: [
      {
        id: "growth",
        label: "Growth",
        kind: "numeric",
        source: { type: "variable", variableId: "growth" },
        unit: "%",
      },
    ],
  };
}
