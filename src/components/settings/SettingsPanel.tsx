import { useRef, useState, type ReactNode } from "react";
import type { Scenario } from "@/engine";
import { bundledScenarios } from "@/scenarios";
import { countEdits } from "@/state/edits";
import { useAppStore } from "@/state/store";
import { setThemePreference, useThemePreference } from "@/theme/useColorScheme";

/**
 * Simulation controls, scenario I/O and the rerun action.
 *
 * Edits never trigger an automatic re-simulation — the rerun button is the
 * explicit gesture, so a half-finished set of probability changes never
 * produces results the user did not ask for.
 */
export function SettingsPanel({ scenario }: { scenario: Scenario }): ReactNode {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const randomizeSeed = useAppStore((s) => s.randomizeSeed);
  const simulate = useAppStore((s) => s.simulate);
  const dirty = useAppStore((s) => s.dirty);
  const running = useAppStore((s) => s.running);
  const edits = useAppStore((s) => s.edits);
  const resetEdits = useAppStore((s) => s.resetEdits);
  const loadBundled = useAppStore((s) => s.loadBundled);
  const importScenarioJson = useAppStore((s) => s.importScenarioJson);
  const importIssues = useAppStore((s) => s.importIssues);
  const clearImportIssues = useAppStore((s) => s.clearImportIssues);
  const warnings = useAppStore((s) => s.warnings);
  const source = useAppStore((s) => s.source);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const editCount = countEdits(edits);

  const readFile = async (file: File) => {
    const text = await file.text();
    importScenarioJson(text, file.name);
  };

  const exportScenario = () => {
    // Exports the *effective* scenario, so live probability edits are baked in
    // and the downloaded file re-imports to exactly what is on screen.
    const blob = new Blob([`${JSON.stringify(scenario, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${scenario.id}${editCount > 0 ? "-edited" : ""}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Section title="Scenario">
        <select
          className="field"
          value={source?.kind === "bundled" ? scenario.id : ""}
          onChange={(e) => loadBundled(e.target.value)}
          aria-label="Bundled scenario"
        >
          {source?.kind === "imported" ? (
            <option value="">{source.label} (imported)</option>
          ) : null}
          {bundledScenarios.map((entry) => (
            <option key={entry.scenario.id} value={entry.scenario.id}>
              {entry.scenario.name}
            </option>
          ))}
        </select>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
          style={{
            border: `1px dashed ${dragging ? "var(--series-1)" : "var(--border)"}`,
            background: dragging ? "var(--surface-3)" : "transparent",
            borderRadius: 8,
            padding: "10px 12px",
            textAlign: "center",
            fontSize: 11.5,
            color: "var(--text-muted)",
          }}
        >
          Drop a scenario JSON here, or{" "}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--series-1)",
              textDecoration: "underline",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            choose a file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {importIssues.length > 0 ? (
          <IssueList
            title="Could not load that file"
            issues={importIssues}
            onDismiss={clearImportIssues}
          />
        ) : null}

        {warnings.length > 0 ? (
          <IssueList title="Warnings" issues={warnings} tone="warning" />
        ) : null}

        <button type="button" className="btn" onClick={exportScenario}>
          Export scenario{editCount > 0 ? " (with edits)" : ""}
        </button>
      </Section>

      <Section title="Simulation">
        <Field label="Monte Carlo runs" htmlFor="runs-input">
          <input
            id="runs-input"
            type="number"
            className="field tabular"
            min={1}
            max={200000}
            step={100}
            value={settings.runs}
            onChange={(e) =>
              updateSettings({ runs: clamp(Number(e.target.value), 1, 200_000) })
            }
          />
        </Field>

        <Field label="Seed" htmlFor="seed-input" hint="Same seed, same results.">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              id="seed-input"
              type="number"
              className="field tabular"
              min={0}
              value={settings.seed}
              onChange={(e) => updateSettings({ seed: Math.max(0, Number(e.target.value)) })}
            />
            <button
              type="button"
              className="btn"
              onClick={randomizeSeed}
              style={{ flexShrink: 0 }}
              title="Pick a new random seed"
            >
              ⟳
            </button>
          </div>
        </Field>

        <Field
          label={`Steps${settings.maxSteps === null ? " (from file)" : ""}`}
          htmlFor="steps-input"
          hint={
            scenario.mode === "horizon"
              ? "Exact number of periods per run."
              : "Safety cap; runs stop earlier at a terminal state."
          }
        >
          <input
            id="steps-input"
            type="number"
            className="field tabular"
            min={1}
            max={500}
            value={settings.maxSteps ?? scenario.maxSteps}
            onChange={(e) =>
              updateSettings({ maxSteps: clamp(Number(e.target.value), 1, 500) })
            }
          />
        </Field>

        <Field
          label="Traces drawn"
          htmlFor="traces-input"
          hint="Display only — the band and median always use every run."
        >
          <input
            id="traces-input"
            type="number"
            className="field tabular"
            min={10}
            max={2000}
            step={10}
            value={settings.traceSampleLimit}
            onChange={(e) =>
              updateSettings({ traceSampleLimit: clamp(Number(e.target.value), 10, 2000) })
            }
          />
        </Field>

        <button
          type="button"
          className={`btn ${dirty ? "btn-primary" : ""}`}
          onClick={simulate}
          disabled={running}
          style={{ width: "100%", padding: "8px 12px" }}
        >
          {running ? "Running…" : dirty ? "Rerun simulation →" : "Rerun simulation"}
        </button>

        {dirty ? (
          <p style={{ fontSize: 11, color: "var(--accent)", margin: 0 }}>
            Settings or probabilities changed since the last run.
          </p>
        ) : null}
      </Section>

      <Section title="Edits">
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>
          {editCount === 0
            ? "Matching the scenario file. Click a state in the diagram, or a CPT row, to change its probabilities."
            : `${editCount} distribution${editCount === 1 ? "" : "s"} changed from the file.`}
        </p>
        <button type="button" className="btn" onClick={resetEdits} disabled={editCount === 0}>
          Reset all edits to file
        </button>
      </Section>

      <Section title="Appearance">
        <ThemeToggle />
      </Section>
    </div>
  );
}

function ThemeToggle(): ReactNode {
  const preference = useThemePreference();
  const options = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ] as const;

  return (
    <div style={{ display: "flex", gap: 4 }} role="group" aria-label="Colour theme">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="btn"
          onClick={() => setThemePreference(option.value)}
          aria-pressed={preference === option.value}
          style={{
            flex: 1,
            padding: "4px 8px",
            fontSize: 11.5,
            background: preference === option.value ? "var(--surface-3)" : "var(--surface-2)",
            color: preference === option.value ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 className="label" style={{ margin: 0 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label htmlFor={htmlFor} style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
        {label}
      </label>
      {children}
      {hint ? <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{hint}</span> : null}
    </div>
  );
}

function IssueList({
  title,
  issues,
  onDismiss,
  tone = "error",
}: {
  title: string;
  issues: Array<{ path: string; message: string }>;
  onDismiss?: () => void;
  tone?: "error" | "warning";
}): ReactNode {
  const color = tone === "error" ? "var(--critical)" : "var(--warning)";

  return (
    <div
      style={{
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "8px 10px",
        background: "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 11.5, color }}>
          {tone === "error" ? "⚠" : "!"} {title}
        </strong>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 0,
              fontSize: 13,
            }}
          >
            ✕
          </button>
        ) : null}
      </div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11, color: "var(--text-secondary)" }}>
        {issues.slice(0, 12).map((issue, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            <code style={{ color: "var(--text-muted)" }}>{issue.path}</code> — {issue.message}
          </li>
        ))}
        {issues.length > 12 ? (
          <li style={{ color: "var(--text-muted)" }}>…and {issues.length - 12} more</li>
        ) : null}
      </ul>
    </div>
  );
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(value)));
}
