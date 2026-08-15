import { create } from "zustand";
import {
  parseScenarioJson,
  randomSeed,
  runMonteCarlo,
  type Scenario,
  type SimulationResult,
  type ValidationIssue,
} from "@/engine";
import { bundledScenarios, defaultScenario } from "@/scenarios";
import {
  applyEdits,
  emptyOverlay,
  isOverlayEmpty,
  type EditOverlay,
} from "./edits";

export interface ScenarioSource {
  kind: "bundled" | "imported";
  label: string;
}

export interface SimulationSettings {
  runs: number;
  seed: number;
  /** Overrides the scenario's own maxSteps when set. */
  maxSteps: number | null;
  /** How many individual traces the run-trace chart draws. */
  traceSampleLimit: number;
}

interface AppState {
  /** The scenario exactly as loaded. Never mutated. */
  base: Scenario | null;
  /** `base` with the edit overlay applied — what the engine runs. */
  scenario: Scenario | null;
  source: ScenarioSource | null;
  edits: EditOverlay;

  settings: SimulationSettings;
  result: SimulationResult | null;
  /** Edits made since the last simulation. Drives the rerun call-to-action. */
  dirty: boolean;
  running: boolean;

  selectedRunId: number | null;
  selectedOutcomeId: string | null;
  hoveredStateId: string | null;
  /** Filter set by clicking an outcome bar; null means "all runs". */
  categoryFilter: string | null;

  importIssues: ValidationIssue[];
  warnings: ValidationIssue[];

  loadScenario: (scenario: Scenario, source: ScenarioSource) => void;
  loadBundled: (scenarioId: string) => void;
  importScenarioJson: (text: string, label: string) => boolean;
  clearImportIssues: () => void;

  setOutgoing: (fromStateId: string, weights: Record<string, number>) => void;
  setCptRow: (
    variableId: string,
    parentKey: string,
    weights: Record<string, number>,
  ) => void;
  setInitial: (weights: Record<string, number>) => void;
  /** Drops the overlay entry for one state, restoring the file's values. */
  clearOutgoingEdit: (fromStateId: string) => void;
  /** Drops the overlay entry for one CPT row. */
  clearCptRowEdit: (variableId: string, parentKey: string) => void;
  resetEdits: () => void;

  updateSettings: (patch: Partial<SimulationSettings>) => void;
  randomizeSeed: () => void;
  simulate: () => void;

  selectRun: (runId: number | null) => void;
  selectOutcome: (outcomeId: string) => void;
  hoverState: (stateId: string | null) => void;
  setCategoryFilter: (value: string | null) => void;
}

const DEFAULT_SETTINGS: SimulationSettings = {
  runs: 5000,
  seed: 20240,
  maxSteps: null,
  // Enough to show the texture of individual paths without becoming a solid
  // block; the band and median behind them always use every run.
  traceSampleLimit: 120,
};

/** First numeric outcome if there is one, else the first outcome at all. */
function preferredOutcome(scenario: Scenario): string | null {
  const numeric = scenario.outcomes.find((o) => o.kind === "numeric");
  return (numeric ?? scenario.outcomes[0])?.id ?? null;
}

export const useAppStore = create<AppState>((set, get) => {
  /** Re-derives the effective scenario after any edit. */
  const recompute = (base: Scenario | null, edits: EditOverlay): Scenario | null =>
    base ? applyEdits(base, edits) : null;

  const markEdited = (edits: EditOverlay) => {
    const { base } = get();
    set({ edits, scenario: recompute(base, edits), dirty: true });
  };

  return {
    base: null,
    scenario: null,
    source: null,
    edits: emptyOverlay(),
    settings: DEFAULT_SETTINGS,
    result: null,
    dirty: false,
    running: false,
    selectedRunId: null,
    selectedOutcomeId: null,
    hoveredStateId: null,
    categoryFilter: null,
    importIssues: [],
    warnings: [],

    loadScenario(scenario, source) {
      const edits = emptyOverlay();
      set({
        base: scenario,
        scenario,
        source,
        edits,
        result: null,
        dirty: false,
        selectedRunId: null,
        selectedOutcomeId: preferredOutcome(scenario),
        hoveredStateId: null,
        categoryFilter: null,
        importIssues: [],
        settings: {
          ...get().settings,
          seed: scenario.seed ?? get().settings.seed,
          maxSteps: null,
        },
      });
      get().simulate();
    },

    loadBundled(scenarioId) {
      const entry = bundledScenarios.find((s) => s.scenario.id === scenarioId);
      if (!entry) return;
      get().loadScenario(entry.scenario, { kind: "bundled", label: entry.file });
      set({ warnings: entry.warnings });
    },

    importScenarioJson(text, label) {
      const result = parseScenarioJson(text);
      if (!result.ok) {
        set({ importIssues: result.issues });
        return false;
      }
      get().loadScenario(result.scenario, { kind: "imported", label });
      set({ warnings: result.warnings });
      return true;
    },

    clearImportIssues() {
      set({ importIssues: [] });
    },

    setOutgoing(fromStateId, weights) {
      const { edits } = get();
      markEdited({
        ...edits,
        transitions: { ...edits.transitions, [fromStateId]: weights },
      });
    },

    setCptRow(variableId, parentKey, weights) {
      const { edits } = get();
      markEdited({
        ...edits,
        cpts: {
          ...edits.cpts,
          [variableId]: { ...edits.cpts[variableId], [parentKey]: weights },
        },
      });
    },

    setInitial(weights) {
      const { edits } = get();
      markEdited({ ...edits, initial: weights });
    },

    clearOutgoingEdit(fromStateId) {
      const { edits } = get();
      if (!(fromStateId in edits.transitions)) return;
      const transitions = { ...edits.transitions };
      delete transitions[fromStateId];
      markEdited({ ...edits, transitions });
    },

    clearCptRowEdit(variableId, parentKey) {
      const { edits } = get();
      const rows = edits.cpts[variableId];
      if (!rows || !(parentKey in rows)) return;

      const nextRows = { ...rows };
      delete nextRows[parentKey];

      const cpts = { ...edits.cpts };
      // Drop the variable entry entirely once its last edited row is gone, so
      // `countEdits` and the "edited" markers stay accurate.
      if (Object.keys(nextRows).length === 0) delete cpts[variableId];
      else cpts[variableId] = nextRows;

      markEdited({ ...edits, cpts });
    },

    resetEdits() {
      const { base } = get();
      set({ edits: emptyOverlay(), scenario: base, dirty: true });
    },

    updateSettings(patch) {
      const settings = { ...get().settings, ...patch };
      // Only inputs that change the simulation itself mark it stale; the trace
      // sample size is a display concern and re-renders without a rerun.
      const affectsSimulation =
        patch.runs !== undefined ||
        patch.seed !== undefined ||
        patch.maxSteps !== undefined;
      set(affectsSimulation ? { settings, dirty: true } : { settings });
    },

    randomizeSeed() {
      get().updateSettings({ seed: randomSeed() });
    },

    simulate() {
      const { scenario, settings } = get();
      if (!scenario) return;

      set({ running: true });
      try {
        const result = runMonteCarlo(scenario, {
          runs: settings.runs,
          seed: settings.seed,
          ...(settings.maxSteps !== null ? { maxSteps: settings.maxSteps } : {}),
        });
        set({
          result,
          dirty: false,
          running: false,
          selectedRunId: null,
          categoryFilter: null,
        });
      } catch (error) {
        // A CPT hole edited into an otherwise valid scenario lands here.
        set({
          running: false,
          importIssues: [
            {
              path: "(simulation)",
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        });
      }
    },

    selectRun(runId) {
      set({ selectedRunId: runId });
    },

    selectOutcome(outcomeId) {
      set({ selectedOutcomeId: outcomeId, categoryFilter: null });
    },

    hoverState(stateId) {
      set({ hoveredStateId: stateId });
    },

    setCategoryFilter(value) {
      set({ categoryFilter: value });
    },
  };
});

/** Loads the first-run scenario. Called once from `main.tsx`. */
export function bootstrapStore(): void {
  const scenario = defaultScenario;
  if (!scenario) return;
  const entry = bundledScenarios.find((s) => s.scenario.id === scenario.id);
  useAppStore.getState().loadScenario(scenario, {
    kind: "bundled",
    label: entry?.file ?? `${scenario.id}.json`,
  });
  if (entry) useAppStore.setState({ warnings: entry.warnings });
}

/** Whether the user has changed anything relative to the loaded file. */
export function hasEdits(state: AppState): boolean {
  return !isOverlayEmpty(state.edits);
}
