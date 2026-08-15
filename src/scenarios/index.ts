import { validateScenario, type ValidationIssue } from "@/engine";
import type { Scenario } from "@/engine";

/**
 * Bundled scenarios, discovered from the JSON files sitting next to this one.
 * Dropping a new `.json` file into this folder registers it — there is no
 * manifest to keep in sync.
 */
const modules = import.meta.glob<{ default: unknown }>("./*.json", { eager: true });

export interface BundledScenario {
  /** Source filename, used as a stable key and in error messages. */
  file: string;
  scenario: Scenario;
  warnings: ValidationIssue[];
}

export interface BrokenScenario {
  file: string;
  issues: ValidationIssue[];
}

const loaded: BundledScenario[] = [];
const broken: BrokenScenario[] = [];

for (const [path, module] of Object.entries(modules)) {
  const file = path.replace(/^\.\//, "");
  const result = validateScenario(module.default);
  if (result.ok) {
    loaded.push({ file, scenario: result.scenario, warnings: result.warnings });
  } else {
    broken.push({ file, issues: result.issues });
  }
}

loaded.sort((a, b) => a.scenario.name.localeCompare(b.scenario.name));

export const bundledScenarios: readonly BundledScenario[] = loaded;

/**
 * Bundled files that failed validation. Surfaced in the UI rather than thrown,
 * so one bad file does not take the whole app down.
 */
export const brokenScenarios: readonly BrokenScenario[] = broken;

/** The scenario shown on first load. */
export const defaultScenario: Scenario | null =
  loaded.find((entry) => entry.scenario.id === "macro-gdp")?.scenario ??
  loaded[0]?.scenario ??
  null;
