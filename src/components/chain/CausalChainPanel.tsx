import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { STATE_PARENT, type Scenario, type Variable } from "@/engine";
import { useAppStore } from "@/state/store";
import { seriesColor } from "@/theme/tokens";
import { useThemeTokens } from "@/theme/useColorScheme";
import { DistributionEditor, type DistributionRow } from "../common/DistributionEditor";
import { NoteBadge, NoteTooltip, Notes } from "../common/Notes";

/**
 * The causal chain downstream of the Markov state.
 *
 * One card per variable in declared order, which is also the causal order —
 * a variable may only condition on something declared before it, so the chain
 * reads top to bottom and can never loop.
 */
export function CausalChainPanel({ scenario }: { scenario: Scenario }): ReactNode {
  if (scenario.variables.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        This scenario declares no downstream variables.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <SourceNode />
      {scenario.variables.map((variable) => (
        <div key={variable.id}>
          <ChainArrow />
          <VariableCard scenario={scenario} variable={variable} />
        </div>
      ))}
    </div>
  );
}

function SourceNode(): ReactNode {
  return (
    <div
      style={{
        border: "1px dashed var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--text-secondary)",
        background: "var(--surface-2)",
      }}
    >
      <strong style={{ color: "var(--text-primary)" }}>Markov state</strong>
      <span style={{ color: "var(--text-muted)" }}> — the chain above, at each step</span>
    </div>
  );
}

function ChainArrow(): ReactNode {
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 13,
        lineHeight: 1,
        padding: "5px 0",
      }}
    >
      ↓
    </div>
  );
}

function VariableCard({
  scenario,
  variable,
}: {
  scenario: Scenario;
  variable: Variable;
}): ReactNode {
  const tokens = useThemeTokens();
  const edits = useAppStore((s) => s.edits);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const parentLabel =
    variable.parent === STATE_PARENT
      ? "Markov state"
      : (scenario.variables.find((v) => v.id === variable.parent)?.label ?? variable.parent);

  const editedRows = edits.cpts[variable.id] ?? {};
  const parentKeys = Object.keys(variable.cpt);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface-1)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 650 }}>{variable.label}</span>
          {variable.unit ? (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({variable.unit})</span>
          ) : null}
          {variable.notes ? (
            <NoteTooltip notes={variable.notes} side="top">
              <span style={{ display: "inline-flex", cursor: "help" }}>
                <NoteBadge />
              </span>
            </NoteTooltip>
          ) : null}
          {Object.keys(editedRows).length > 0 ? <EditedBadge /> : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          conditioned on {parentLabel}
        </div>
      </div>

      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
          {variable.levels.map((level) => (
            <span
              key={level.id}
              style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}
            >
              {level.label}
              {level.range ? (
                <span className="tabular" style={{ color: "var(--text-muted)" }}>
                  {" "}
                  {level.range[0]}–{level.range[1]}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {/* Tall CPTs scroll inside the card rather than stretching the column. */}
      <div style={{ maxHeight: 208, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr>
              <th
                style={{
                  ...headerCell,
                  textAlign: "left",
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                }}
              >
                {parentLabel}
              </th>
              {variable.levels.map((level) => (
                <th key={level.id} style={{ ...headerCell, textAlign: "right" }} title={level.label}>
                  {level.label.split(" ")[0]}
                </th>
              ))}
              <th style={{ ...headerCell, width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {parentKeys.map((parentKey) => {
              const row = variable.cpt[parentKey] ?? {};
              const total = variable.levels.reduce((sum, l) => sum + (row[l.id] ?? 0), 0);
              const isEdited = parentKey in editedRows;
              const stateIndex = scenario.states.findIndex((s) => s.id === parentKey);

              return (
                <tr key={parentKey} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...bodyCell, textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {variable.parent === STATE_PARENT && stateIndex >= 0 ? (
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: seriesColor(tokens, stateIndex),
                            flexShrink: 0,
                          }}
                        />
                      ) : null}
                      {parentKeyLabel(scenario, variable, parentKey)}
                      {isEdited ? <EditedDot /> : null}
                    </span>
                  </td>

                  {variable.levels.map((level) => {
                    const share = total > 0 ? (row[level.id] ?? 0) / total : 0;
                    return (
                      <td key={level.id} className="tabular" style={{ ...bodyCell, textAlign: "right" }}>
                        <span style={{ color: share === 0 ? "var(--text-muted)" : "var(--text-primary)" }}>
                          {(share * 100).toFixed(0)}
                        </span>
                      </td>
                    );
                  })}

                  <td style={{ ...bodyCell, textAlign: "right" }}>
                    <Popover.Root
                      open={openRow === parentKey}
                      onOpenChange={(open) => setOpenRow(open ? parentKey : null)}
                    >
                      <Popover.Trigger asChild>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "1px 6px", fontSize: 10 }}
                          aria-label={`Edit ${parentKeyLabel(scenario, variable, parentKey)} row`}
                        >
                          edit
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content
                          side="left"
                          align="start"
                          sideOffset={8}
                          collisionPadding={16}
                          className="overlay-panel"
                          style={{ width: 320, padding: 14, maxHeight: "70vh", overflowY: "auto" }}
                        >
                          <CptRowEditor
                            scenario={scenario}
                            variable={variable}
                            parentKey={parentKey}
                            isEdited={isEdited}
                            onClose={() => setOpenRow(null)}
                          />
                          <Popover.Arrow style={{ fill: "var(--surface-1)" }} />
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CptRowEditor({
  scenario,
  variable,
  parentKey,
  isEdited,
  onClose,
}: {
  scenario: Scenario;
  variable: Variable;
  parentKey: string;
  isEdited: boolean;
  onClose: () => void;
}): ReactNode {
  const setCptRow = useAppStore((s) => s.setCptRow);
  const clearCptRowEdit = useAppStore((s) => s.clearCptRowEdit);

  const row = variable.cpt[parentKey] ?? {};
  const rows: DistributionRow[] = variable.levels.map((level) => ({
    id: level.id,
    label: level.label,
    notes: level.range ? `Sampled uniformly from ${level.range[0]} to ${level.range[1]}.` : undefined,
  }));
  const weights = Object.fromEntries(variable.levels.map((l) => [l.id, row[l.id] ?? 0]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 650 }}>{variable.label}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            given {parentKeyLabel(scenario, variable, parentKey)}
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={onClose}
          aria-label="Close"
          style={{ padding: "2px 8px", fontSize: 13, lineHeight: 1.3 }}
        >
          ✕
        </button>
      </div>

      {variable.notes ? (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--text-secondary)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 10px",
            maxHeight: 160,
            overflowY: "auto",
          }}
        >
          <Notes text={variable.notes} />
        </div>
      ) : null}

      <DistributionEditor
        rows={rows}
        weights={weights}
        onChange={(next) => setCptRow(variable.id, parentKey, next)}
        onReset={isEdited ? () => clearCptRowEdit(variable.id, parentKey) : undefined}
      />
    </div>
  );
}

function parentKeyLabel(scenario: Scenario, variable: Variable, parentKey: string): string {
  if (parentKey === "*") return "any (fallback)";
  if (variable.parent === STATE_PARENT) {
    return scenario.states.find((s) => s.id === parentKey)?.label ?? parentKey;
  }
  const parent = scenario.variables.find((v) => v.id === variable.parent);
  return parent?.levels.find((l) => l.id === parentKey)?.label ?? parentKey;
}

function EditedBadge(): ReactNode {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--accent)",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        padding: "0 4px",
      }}
    >
      edited
    </span>
  );
}

function EditedDot(): ReactNode {
  return (
    <span
      title="Edited — differs from the scenario file"
      style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: "var(--accent)",
        flexShrink: 0,
      }}
    />
  );
}

const headerCell: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  background: "var(--surface-2)",
  position: "sticky",
  top: 0,
  zIndex: 1,
  whiteSpace: "nowrap",
};

const bodyCell: React.CSSProperties = {
  padding: "5px 8px",
  whiteSpace: "nowrap",
  color: "var(--text-secondary)",
};
