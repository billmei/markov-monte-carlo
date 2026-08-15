import { z } from "zod";
import { STATE_PARENT, type Scenario } from "./types";
import { CPT_WILDCARD } from "./variables";

/**
 * The scenario file format lives here and only here. Structural checks are
 * expressed with zod; the cross-reference checks that zod cannot express
 * (targets exist, CPT rows cover every parent key, terminal states are really
 * terminal) run afterwards in `checkReferences`.
 *
 * Authoring scenarios by hand is the whole point of the app, so validation
 * failures return a readable list rather than throwing.
 */

const identifier = z
  .string()
  .min(1, "must not be empty")
  .regex(/^[A-Za-z0-9_-]+$/, "may only contain letters, numbers, - and _");

const markovStateSchema = z.object({
  id: identifier,
  label: z.string().min(1),
  terminal: z.boolean().optional(),
  category: z.string().min(1).optional(),
  notes: z.string().optional(),
});

const transitionSchema = z.object({
  to: identifier,
  p: z.number().nonnegative().finite(),
  notes: z.string().optional(),
});

const levelSchema = z.object({
  id: identifier,
  label: z.string().min(1),
  range: z.tuple([z.number().finite(), z.number().finite()]).optional(),
});

const variableSchema = z.object({
  id: identifier,
  label: z.string().min(1),
  parent: z.string().min(1),
  unit: z.string().optional(),
  levels: z.array(levelSchema).min(1, "needs at least one level"),
  cpt: z.record(z.string(), z.record(z.string(), z.number().nonnegative().finite())),
  notes: z.string().optional(),
});

const outcomeSourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("variable"), variableId: identifier }),
  z.object({ type: z.literal("variableLevel"), variableId: identifier }),
  z.object({ type: z.literal("terminalState") }),
  z.object({ type: z.literal("stateCategory") }),
]);

const outcomeSchema = z.object({
  id: identifier,
  label: z.string().min(1),
  kind: z.enum(["numeric", "categorical"]),
  source: outcomeSourceSchema,
  unit: z.string().optional(),
  notes: z.string().optional(),
});

export const scenarioSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  description: z.string().optional(),
  mode: z.enum(["absorbing", "horizon"]),
  maxSteps: z.number().int().positive().max(500),
  seed: z.number().int().nonnegative().optional(),
  states: z.array(markovStateSchema).min(1, "needs at least one state"),
  initial: z.record(identifier, z.number().nonnegative().finite()),
  transitions: z.record(identifier, z.array(transitionSchema)),
  variables: z.array(variableSchema),
  outcomes: z.array(outcomeSchema).min(1, "needs at least one outcome"),
});

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; scenario: Scenario; warnings: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[]; warnings: ValidationIssue[] };

type ParsedScenario = z.infer<typeof scenarioSchema>;

/** Cross-reference checks that the structural schema cannot express. */
function checkReferences(scenario: ParsedScenario): {
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const fail = (path: string, message: string) => issues.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  // --- states -------------------------------------------------------------
  const stateIds = new Set<string>();
  for (const [i, state] of scenario.states.entries()) {
    if (stateIds.has(state.id)) fail(`states[${i}].id`, `duplicate state id "${state.id}"`);
    stateIds.add(state.id);
  }
  const stateById = new Map(scenario.states.map((s) => [s.id, s]));

  // --- initial ------------------------------------------------------------
  const initialEntries = Object.entries(scenario.initial);
  if (initialEntries.length === 0) {
    fail("initial", "at least one start state is required");
  }
  for (const [id] of initialEntries) {
    if (!stateIds.has(id)) fail(`initial.${id}`, `unknown state "${id}"`);
  }
  if (initialEntries.length > 0 && initialEntries.every(([, w]) => w <= 0)) {
    fail("initial", "start weights sum to zero");
  }

  // --- transitions --------------------------------------------------------
  for (const [from, transitions] of Object.entries(scenario.transitions)) {
    if (!stateIds.has(from)) {
      fail(`transitions.${from}`, `unknown source state "${from}"`);
      continue;
    }
    if (stateById.get(from)?.terminal && transitions.length > 0) {
      fail(
        `transitions.${from}`,
        `state "${from}" is marked terminal but declares outgoing transitions`,
      );
    }
    if (transitions.length > 0 && transitions.every((t) => t.p <= 0)) {
      fail(`transitions.${from}`, "all outgoing probabilities are zero");
    }
    const seen = new Set<string>();
    for (const [i, transition] of transitions.entries()) {
      if (!stateIds.has(transition.to)) {
        fail(`transitions.${from}[${i}].to`, `unknown target state "${transition.to}"`);
      }
      if (seen.has(transition.to)) {
        fail(`transitions.${from}[${i}].to`, `duplicate transition to "${transition.to}"`);
      }
      seen.add(transition.to);
    }
  }

  const hasStop = scenario.states.some(
    (s) => s.terminal || (scenario.transitions[s.id] ?? []).length === 0,
  );
  if (scenario.mode === "absorbing" && !hasStop) {
    warn(
      "states",
      "no terminal or dead-end state: absorbing runs will always stop at maxSteps",
    );
  }

  // --- variables ----------------------------------------------------------
  // Parents must be declared earlier in the array, which both fixes the causal
  // order and makes a dependency cycle impossible to express.
  const declared = new Map<string, Set<string>>();
  for (const [i, variable] of scenario.variables.entries()) {
    const at = `variables[${i}]`;

    if (declared.has(variable.id)) fail(`${at}.id`, `duplicate variable id "${variable.id}"`);

    const levelIds = new Set<string>();
    for (const [j, level] of variable.levels.entries()) {
      if (levelIds.has(level.id)) {
        fail(`${at}.levels[${j}].id`, `duplicate level id "${level.id}"`);
      }
      levelIds.add(level.id);
    }

    let parentKeys: Set<string> | null = null;
    if (variable.parent === STATE_PARENT) {
      parentKeys = stateIds;
    } else if (declared.has(variable.parent)) {
      parentKeys = declared.get(variable.parent)!;
    } else {
      fail(
        `${at}.parent`,
        `parent "${variable.parent}" must be "${STATE_PARENT}" or a variable declared before this one`,
      );
    }

    const hasWildcard = CPT_WILDCARD in variable.cpt;
    for (const [key, row] of Object.entries(variable.cpt)) {
      if (key !== CPT_WILDCARD && parentKeys && !parentKeys.has(key)) {
        fail(`${at}.cpt.${key}`, `"${key}" is not a valid value of parent "${variable.parent}"`);
      }
      const rowEntries = Object.entries(row);
      for (const [levelId] of rowEntries) {
        if (!levelIds.has(levelId)) {
          fail(`${at}.cpt.${key}.${levelId}`, `unknown level "${levelId}"`);
        }
      }
      if (rowEntries.length === 0 || rowEntries.every(([, w]) => w <= 0)) {
        fail(`${at}.cpt.${key}`, "row weights sum to zero");
      }
    }

    if (parentKeys && !hasWildcard) {
      const missing = [...parentKeys].filter((key) => !(key in variable.cpt));
      if (missing.length > 0) {
        fail(
          `${at}.cpt`,
          `missing conditional rows for: ${missing.join(", ")} (add them, or a "${CPT_WILDCARD}" fallback row)`,
        );
      }
    }

    declared.set(variable.id, levelIds);
  }

  // --- outcomes -----------------------------------------------------------
  const outcomeIds = new Set<string>();
  const variableById = new Map(scenario.variables.map((v) => [v.id, v]));
  for (const [i, outcome] of scenario.outcomes.entries()) {
    const at = `outcomes[${i}]`;
    if (outcomeIds.has(outcome.id)) fail(`${at}.id`, `duplicate outcome id "${outcome.id}"`);
    outcomeIds.add(outcome.id);

    const source = outcome.source;
    if (source.type === "variable" || source.type === "variableLevel") {
      const variable = variableById.get(source.variableId);
      if (!variable) {
        fail(`${at}.source.variableId`, `unknown variable "${source.variableId}"`);
      } else if (source.type === "variable" && !variable.levels.some((l) => l.range)) {
        fail(
          `${at}.source`,
          `variable "${source.variableId}" has no numeric ranges, so it cannot back a numeric outcome`,
        );
      }
    }

    const numericSource = source.type === "variable";
    if (outcome.kind === "numeric" && !numericSource) {
      fail(`${at}.kind`, 'numeric outcomes require a source of type "variable"');
    }
    if (outcome.kind === "categorical" && numericSource) {
      fail(
        `${at}.kind`,
        'categorical outcomes require "variableLevel", "terminalState" or "stateCategory"',
      );
    }
    if (source.type === "stateCategory" && !scenario.states.some((s) => s.category)) {
      warn(`${at}.source`, "no state declares a category; this outcome falls back to labels");
    }
  }

  return { issues, warnings };
}

/**
 * Validates arbitrary parsed JSON against the scenario format.
 * Never throws — inspect `ok` and render the issues.
 */
export function validateScenario(input: unknown): ValidationResult {
  const parsed = scenarioSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      warnings: [],
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
        message: issue.message,
      })),
    };
  }

  const { issues, warnings } = checkReferences(parsed.data);
  if (issues.length > 0) return { ok: false, issues, warnings };

  return { ok: true, scenario: parsed.data as Scenario, warnings };
}

/** Parses a JSON string, reporting syntax errors in the same shape. */
export function parseScenarioJson(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      issues: [
        {
          path: "(file)",
          message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
  return validateScenario(data);
}
