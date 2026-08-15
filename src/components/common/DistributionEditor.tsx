import { useMemo, useState, type ReactNode } from "react";
import * as Slider from "@radix-ui/react-slider";
import { redistribute, toPercentages, toWeights } from "./redistribute";
import { NoteBadge, NoteTooltip } from "./Notes";

export interface DistributionRow {
  id: string;
  label: string;
  notes?: string | undefined;
  /** Swatch shown beside the label, used for Markov state rows. */
  color?: string;
}

export interface DistributionEditorProps {
  rows: DistributionRow[];
  /** Engine weights keyed by row id. Normalized for display. */
  weights: Record<string, number>;
  /** Receives engine weights (0–1) whenever the user changes something. */
  onChange: (weights: Record<string, number>) => void;
  /** Restores the file's values. Omitted when nothing is edited. */
  onReset?: (() => void) | undefined;
}

/**
 * Editor for one probability distribution — a state's outgoing transitions, or
 * one row of a conditional probability table.
 *
 * Editing any row renormalizes the others so the distribution always sums to
 * 100%, and a per-row lock holds a branch fixed while the remainder is spread
 * across the rest. Topology is fixed by the scenario file, so rows can be
 * neither added nor removed here.
 */
export function DistributionEditor({
  rows,
  weights,
  onChange,
  onReset,
}: DistributionEditorProps): ReactNode {
  const [locked, setLocked] = useState<ReadonlySet<string>>(new Set());

  const percentages = useMemo(
    () => toPercentages(Object.fromEntries(rows.map((r) => [r.id, weights[r.id] ?? 0]))),
    [rows, weights],
  );

  const total = Object.values(percentages).reduce((a, b) => a + b, 0);

  const apply = (changedId: string, nextValue: number) => {
    const next = redistribute({ values: percentages, changedId, nextValue, locked });
    onChange(toWeights(next));
  };

  const toggleLock = (id: string) => {
    setLocked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((row) => {
        const value = percentages[row.id] ?? 0;
        const isLocked = locked.has(row.id);

        return (
          <div key={row.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {row.color ? (
                <span
                  aria-hidden
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: row.color,
                    flexShrink: 0,
                  }}
                />
              ) : null}

              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-primary)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.label}
              </span>

              {row.notes ? (
                <NoteTooltip notes={row.notes} side="top">
                  <span style={{ display: "inline-flex", cursor: "help" }}>
                    <NoteBadge />
                  </span>
                </NoteTooltip>
              ) : null}

              <input
                type="number"
                className="field tabular"
                min={0}
                max={100}
                step={0.5}
                value={Number(value.toFixed(1))}
                disabled={isLocked}
                onChange={(e) => apply(row.id, Number(e.target.value))}
                aria-label={`${row.label} probability, percent`}
                style={{ width: 66, padding: "3px 6px", textAlign: "right" }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)", width: 10 }}>%</span>

              <button
                type="button"
                className="btn"
                onClick={() => toggleLock(row.id)}
                aria-pressed={isLocked}
                title={isLocked ? "Unlock — allow rebalancing" : "Lock — hold this value"}
                style={{
                  padding: "2px 6px",
                  fontSize: 11,
                  minWidth: 26,
                  background: isLocked ? "var(--surface-3)" : "var(--surface-2)",
                  color: isLocked ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {isLocked ? "🔒" : "🔓"}
              </button>
            </div>

            <Slider.Root
              value={[value]}
              min={0}
              max={100}
              step={0.5}
              disabled={isLocked}
              onValueChange={([next]) => apply(row.id, next ?? 0)}
              aria-label={`${row.label} probability`}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                height: 16,
                userSelect: "none",
                touchAction: "none",
                opacity: isLocked ? 0.5 : 1,
              }}
            >
              <Slider.Track
                style={{
                  position: "relative",
                  flexGrow: 1,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--surface-3)",
                }}
              >
                <Slider.Range
                  style={{
                    position: "absolute",
                    height: "100%",
                    borderRadius: 2,
                    background: row.color ?? "var(--series-1)",
                  }}
                />
              </Slider.Track>
              <Slider.Thumb
                style={{
                  display: "block",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "var(--surface-1)",
                  border: `2px solid ${row.color ?? "var(--series-1)"}`,
                  cursor: "grab",
                }}
              />
            </Slider.Root>
          </div>
        );
      })}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid var(--border)",
          paddingTop: 8,
          fontSize: 11,
        }}
      >
        <span className="tabular" style={{ color: "var(--text-muted)" }}>
          Sums to {total.toFixed(1)}%
        </span>
        {onReset ? (
          <button type="button" className="btn" onClick={onReset} style={{ padding: "3px 8px", fontSize: 11 }}>
            Reset to file
          </button>
        ) : null}
      </div>
    </div>
  );
}
