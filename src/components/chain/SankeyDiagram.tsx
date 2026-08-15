import { useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { buildAnalyticFlow, buildFlowFromRuns, type Scenario } from "@/engine";
import { useAppStore } from "@/state/store";
import { seriesColor, withAlpha } from "@/theme/tokens";
import { useThemeTokens } from "@/theme/useColorScheme";
import { useElementWidth } from "../common/useElementWidth";
import { DistributionEditor, type DistributionRow } from "../common/DistributionEditor";
import { NoteTooltip, Notes } from "../common/Notes";
import { labelsEveryColumn, useSankeyLayout } from "./useSankeyLayout";

type FlowBasis = "sampled" | "declared";

/**
 * The chain, drawn as a Sankey and doubling as the editing surface.
 *
 * Nodes are `(state, step)` pairs. Time-expanding the graph this way is what
 * lets a recurrent chain be laid out as a Sankey at all — d3-sankey needs a
 * DAG, and a link at step k always points into column k+1.
 */
export function SankeyDiagram({ scenario }: { scenario: Scenario }): ReactNode {
  const tokens = useThemeTokens();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);

  const result = useAppStore((s) => s.result);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const hoveredStateId = useAppStore((s) => s.hoveredStateId);
  const hoverState = useAppStore((s) => s.hoverState);
  const setOutgoing = useAppStore((s) => s.setOutgoing);
  const edits = useAppStore((s) => s.edits);

  const [basis, setBasis] = useState<FlowBasis>("sampled");
  const [editingKey, setEditingKey] = useState<string | null>(null);

  /** Declaration order drives colour assignment — fixed slots, never cycled. */
  const stateOrder = useMemo(
    () => new Map(scenario.states.map((s, i) => [s.id, i])),
    [scenario],
  );

  const graph = useMemo(() => {
    if (basis === "declared" || !result) return buildAnalyticFlow(scenario);
    return buildFlowFromRuns(scenario, result);
  }, [scenario, result, basis]);

  const layout = useSankeyLayout(graph, stateOrder, Math.max(0, width - 2));

  /** Node and link keys visited by the selected run, for path highlighting. */
  const selectedPath = useMemo(() => {
    const nodes = new Set<string>();
    const links = new Set<string>();
    if (selectedRunId === null || !result) return { nodes, links };

    const run = result.runs.find((r) => r.id === selectedRunId);
    if (!run) return { nodes, links };

    run.steps.forEach((step, i) => {
      nodes.add(`${step.stateId}@${i}`);
      const next = run.steps[i + 1];
      if (next) links.add(`${step.stateId}->${next.stateId}@${i}`);
    });
    return { nodes, links };
  }, [selectedRunId, result]);

  const hasSelection = selectedPath.nodes.size > 0;
  const labelEveryColumn = labelsEveryColumn(graph.stepCount);
  const lastStep = graph.stepCount - 1;
  const editingNode = layout?.nodes.find((n) => n.key === editingKey) ?? null;
  const editingState = editingNode
    ? scenario.states.find((s) => s.id === editingNode.stateId)
    : null;

  const totalLabel = basis === "sampled" && result ? `${result.runs.length} runs` : "probability";

  if (!layout) {
    return (
      <div ref={containerRef} style={{ padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
        Nothing to draw yet — run a simulation.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <StateLegend scenario={scenario} onHover={hoverState} hovered={hoveredStateId} />

        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {(["sampled", "declared"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="btn"
              onClick={() => setBasis(option)}
              aria-pressed={basis === option}
              title={
                option === "sampled"
                  ? "Flow widths from the actual Monte Carlo runs"
                  : "Flow widths from the declared probabilities, no sampling"
              }
              style={{
                padding: "3px 9px",
                fontSize: 11,
                background: basis === option ? "var(--surface-3)" : "transparent",
                color: basis === option ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {option === "sampled" ? "Sampled" : "Declared"}
            </button>
          ))}
        </div>
      </div>

      {/* Wide chains scroll horizontally inside their own container so the page never does. */}
      <div ref={containerRef} style={{ overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ position: "relative", width: layout.width, height: layout.height }}>
          <svg
            width={layout.width}
            height={layout.height}
            role="img"
            aria-label={`Markov chain flow diagram across ${graph.stepCount} steps`}
            style={{ display: "block", overflow: "visible" }}
          >
            <g>
              {layout.links.map((link) => {
                const key = `${link.fromStateId}->${link.toStateId}@${link.step}`;
                const onPath = selectedPath.links.has(key);
                const dimmedByHover =
                  hoveredStateId !== null &&
                  link.fromStateId !== hoveredStateId &&
                  link.toStateId !== hoveredStateId;
                const dimmedBySelection = hasSelection && !onPath;

                const opacity = onPath ? 0.85 : dimmedByHover || dimmedBySelection ? 0.06 : 0.34;

                return (
                  <path
                    key={key}
                    d={link.path}
                    fill={seriesColor(tokens, link.colorIndex)}
                    fillOpacity={opacity}
                    style={{ transition: "fill-opacity 120ms ease" }}
                  >
                    <title>
                      {`${labelOf(scenario, link.fromStateId)} → ${labelOf(scenario, link.toStateId)}` +
                        ` · step ${link.step + 1} · ${(link.share * 100).toFixed(1)}%` +
                        ` · ${formatFlow(link.value, basis)}`}
                    </title>
                  </path>
                );
              })}
            </g>

            <g>
              {layout.nodes.map((node) => {
                const state = scenario.states.find((s) => s.id === node.stateId);
                const onPath = selectedPath.nodes.has(node.key);
                const dimmed =
                  (hoveredStateId !== null && node.stateId !== hoveredStateId) ||
                  (hasSelection && !onPath);
                const height = Math.max(2, node.y1 - node.y0);
                const color = seriesColor(tokens, node.colorIndex);
                const isEdited = Boolean(edits.transitions[node.stateId]);

                return (
                  <g
                    key={node.key}
                    onMouseEnter={() => hoverState(node.stateId)}
                    onMouseLeave={() => hoverState(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <NoteTooltip
                      notes={state?.notes}
                      hint={
                        (scenario.transitions[node.stateId]?.length ?? 0) > 0
                          ? "Click to edit this state's transition probabilities"
                          : "Terminal state — no outgoing transitions"
                      }
                    >
                      <rect
                        x={node.x0}
                        y={node.y0}
                        width={Math.max(2, node.x1 - node.x0)}
                        height={height}
                        rx={3}
                        fill={color}
                        fillOpacity={dimmed ? 0.25 : 1}
                        stroke={
                          isEdited ? tokens.accent : onPath ? tokens.textPrimary : "transparent"
                        }
                        strokeWidth={isEdited || onPath ? 2 : 0}
                        onClick={() => setEditingKey(node.key)}
                        tabIndex={0}
                        role="button"
                        aria-label={`${state?.label ?? node.stateId}, step ${node.step + 1}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setEditingKey(node.key);
                          }
                        }}
                        style={{ transition: "fill-opacity 120ms ease" }}
                      />
                    </NoteTooltip>

                    {/* Direct labels where there is room. On dense chains only
                        the outer columns are labelled; the legend and the
                        per-node tooltips carry identity in between. */}
                    {height >= 15 && (labelEveryColumn || node.step === 0 || node.step === lastStep) ? (
                      <text
                        x={node.step === lastStep && !labelEveryColumn ? node.x0 - 5 : node.x1 + 5}
                        y={(node.y0 + node.y1) / 2}
                        textAnchor={
                          node.step === lastStep && !labelEveryColumn ? "end" : "start"
                        }
                        dominantBaseline="middle"
                        pointerEvents="none"
                        style={{
                          fontSize: 10.5,
                          fill: dimmed ? tokens.textMuted : tokens.textSecondary,
                          fontWeight: onPath ? 700 : 500,
                          // Halo so labels stay readable over the ribbons.
                          paintOrder: "stroke",
                          stroke: tokens.surface1,
                          strokeWidth: 3,
                          strokeLinejoin: "round",
                        }}
                      >
                        {state?.label ?? node.stateId}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>

            <g>
              {Array.from({ length: graph.stepCount }, (_, step) => {
                const column = layout.nodes.find((n) => n.step === step);
                if (!column) return null;
                return (
                  <text
                    key={step}
                    x={(column.x0 + column.x1) / 2}
                    y={layout.height - 1}
                    textAnchor="middle"
                    style={{ fontSize: 9.5, fill: tokens.textMuted }}
                  >
                    {step + 1}
                  </text>
                );
              })}
            </g>
          </svg>

          {/* Anchor for the editor popover, positioned over the clicked node. */}
          {editingNode ? (
            <div
              style={{
                position: "absolute",
                left: editingNode.x0,
                top: editingNode.y0,
                width: Math.max(2, editingNode.x1 - editingNode.x0),
                height: Math.max(2, editingNode.y1 - editingNode.y0),
                pointerEvents: "none",
              }}
            >
              <Popover.Root
                open
                onOpenChange={(open) => {
                  if (!open) setEditingKey(null);
                }}
              >
                <Popover.Anchor style={{ width: "100%", height: "100%" }} />
                <Popover.Portal>
                  <Popover.Content
                    side="right"
                    align="start"
                    sideOffset={10}
                    collisionPadding={16}
                    className="overlay-panel"
                    style={{ width: 340, padding: 14, maxHeight: "70vh", overflowY: "auto" }}
                  >
                    <StateEditor
                      scenario={scenario}
                      stateId={editingNode.stateId}
                      onClose={() => setEditingKey(null)}
                      onChange={(weights) => setOutgoing(editingNode.stateId, weights)}
                      isEdited={Boolean(edits.transitions[editingNode.stateId])}
                    />
                    <Popover.Arrow style={{ fill: "var(--surface-1)" }} />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          ) : null}
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
        Ribbon width is {basis === "sampled" ? "runs" : "probability mass"} flowing between states;
        the axis below numbers each step. Widths shown for {totalLabel}.
        {editingState ? null : " Click any box to edit its outgoing probabilities."}
      </p>
    </div>
  );
}

function labelOf(scenario: Scenario, stateId: string): string {
  return scenario.states.find((s) => s.id === stateId)?.label ?? stateId;
}

function formatFlow(value: number, basis: FlowBasis): string {
  return basis === "sampled"
    ? `${Math.round(value).toLocaleString()} runs`
    : `${(value * 100).toFixed(2)}% of mass`;
}

/** Colour key for the states. Identity is never carried by colour alone. */
function StateLegend({
  scenario,
  hovered,
  onHover,
}: {
  scenario: Scenario;
  hovered: string | null;
  onHover: (id: string | null) => void;
}): ReactNode {
  const tokens = useThemeTokens();

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", minWidth: 0 }}>
      {scenario.states.map((state, i) => (
        <button
          key={state.id}
          type="button"
          onMouseEnter={() => onHover(state.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(state.id)}
          onBlur={() => onHover(null)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "default",
            fontSize: 11.5,
            color: hovered && hovered !== state.id ? "var(--text-muted)" : "var(--text-secondary)",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              flexShrink: 0,
              background: seriesColor(tokens, i),
              outline:
                hovered === state.id ? `2px solid ${withAlpha(tokens.textPrimary, 0.35)}` : "none",
              outlineOffset: 1,
            }}
          />
          {state.label}
          {state.terminal ? (
            <span style={{ color: "var(--text-muted)", fontSize: 10 }}>·end</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Popover body: the state's notes, plus its outgoing-probability editor. */
function StateEditor({
  scenario,
  stateId,
  onChange,
  onClose,
  isEdited,
}: {
  scenario: Scenario;
  stateId: string;
  onChange: (weights: Record<string, number>) => void;
  onClose: () => void;
  isEdited: boolean;
}): ReactNode {
  const tokens = useThemeTokens();
  const clearOutgoingEdit = useAppStore((s) => s.clearOutgoingEdit);
  const state = scenario.states.find((s) => s.id === stateId);
  const transitions = scenario.transitions[stateId] ?? [];

  const rows: DistributionRow[] = transitions.map((t) => {
    const index = scenario.states.findIndex((s) => s.id === t.to);
    return {
      id: t.to,
      label: labelOf(scenario, t.to),
      notes: t.notes,
      color: seriesColor(tokens, index < 0 ? 0 : index),
    };
  });

  const weights = Object.fromEntries(transitions.map((t) => [t.to, t.p]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 650 }}>{state?.label ?? stateId}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {transitions.length > 0
              ? "Outgoing transition probabilities"
              : state?.terminal
                ? "Terminal state"
                : "No outgoing transitions"}
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

      {state?.notes ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 10px",
            maxHeight: 190,
            overflowY: "auto",
          }}
        >
          <Notes text={state.notes} />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <DistributionEditor
            rows={rows}
            weights={weights}
            onChange={onChange}
            onReset={isEdited ? () => clearOutgoingEdit(stateId) : undefined}
          />
          <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: 0 }}>
            These probabilities belong to the state, not to this step — editing here changes every
            column it appears in. Which transitions exist is fixed by the scenario file.
          </p>
        </>
      ) : null}
    </div>
  );
}
