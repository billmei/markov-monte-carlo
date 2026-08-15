import { useMemo } from "react";
import { sankey, sankeyLeft, type SankeyGraph } from "d3-sankey";
import type { FlowGraph, FlowLink, FlowNode } from "@/engine";

export interface LaidOutNode extends FlowNode {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Index into the categorical palette, by state declaration order. */
  colorIndex: number;
}

export interface LaidOutLink extends FlowLink {
  /** SVG path for the ribbon. */
  path: string;
  width: number;
  colorIndex: number;
}

export interface SankeyLayout {
  nodes: LaidOutNode[];
  links: LaidOutLink[];
  width: number;
  height: number;
}

/** d3-sankey mutates the objects it lays out, so it gets its own copies. */
interface D3Node {
  key: string;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
}

interface D3Link {
  source: string | D3Node;
  target: string | D3Node;
  value: number;
  index?: number;
  width?: number;
  y0?: number;
  y1?: number;
}

const NODE_WIDTH = 13;
const NODE_PADDING = 10;

/**
 * Minimum horizontal room per step column before the diagram scrolls.
 *
 * Short chains get room for a label beside every node. Long ones (a 16-quarter
 * macro run, a 12-year migration) would need ~1900px at that width, so they
 * tighten up and label only the outer columns instead — the legend and the
 * per-node tooltips carry identity in between.
 */
export function columnWidthFor(columns: number): number {
  if (columns <= 6) return 132;
  if (columns <= 10) return 96;
  return 66;
}

/** Whether there is room to label every column, or only the first and last. */
export function labelsEveryColumn(columns: number): boolean {
  return columns <= 6;
}

/**
 * Custom link path.
 *
 * `sankeyLinkHorizontal` from d3-shape draws a ribbon whose thickness is a
 * stroke, which makes per-link opacity and hit-testing awkward. Drawing a
 * closed area instead gives a fillable shape — easier to dim, easier to click,
 * and it renders correctly when a link's endpoints sit at different heights.
 */
function ribbonPath(link: Required<Pick<D3Link, "y0" | "y1" | "width">> & {
  source: D3Node;
  target: D3Node;
}): string {
  const x0 = link.source.x1 ?? 0;
  const x1 = link.target.x0 ?? 0;
  const halfWidth = link.width / 2;
  const curve = (x0 + x1) / 2;

  const topStart = link.y0 - halfWidth;
  const topEnd = link.y1 - halfWidth;
  const bottomStart = link.y0 + halfWidth;
  const bottomEnd = link.y1 + halfWidth;

  return [
    `M${x0},${topStart}`,
    `C${curve},${topStart} ${curve},${topEnd} ${x1},${topEnd}`,
    `L${x1},${bottomEnd}`,
    `C${curve},${bottomEnd} ${curve},${bottomStart} ${x0},${bottomStart}`,
    "Z",
  ].join(" ");
}

/**
 * Runs the d3-sankey layout over a flow graph.
 *
 * The graph arrives time-expanded — nodes are `(state, step)` pairs — so it is
 * acyclic by construction and d3-sankey can lay it out even when the underlying
 * chain revisits states.
 */
export function useSankeyLayout(
  graph: FlowGraph | null,
  stateOrder: Map<string, number>,
  availableWidth: number,
): SankeyLayout | null {
  return useMemo(() => {
    if (!graph || graph.nodes.length === 0 || graph.links.length === 0) return null;

    const columns = Math.max(1, graph.stepCount);
    const width = Math.max(availableWidth, columns * columnWidthFor(columns));

    // Height grows with the busiest column so nodes never collapse to slivers.
    const perColumn = new Map<number, number>();
    for (const node of graph.nodes) {
      perColumn.set(node.step, (perColumn.get(node.step) ?? 0) + 1);
    }
    const busiest = Math.max(1, ...perColumn.values());
    const height = Math.max(260, Math.min(560, busiest * 46 + 40));

    const nodes: D3Node[] = graph.nodes.map((n) => ({ key: n.key }));
    const links: D3Link[] = graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      value: Math.max(l.value, 1e-9),
    }));

    let laidOut: SankeyGraph<D3Node, D3Link>;
    try {
      laidOut = sankey<D3Node, D3Link>()
        .nodeId((d) => d.key)
        .nodeWidth(NODE_WIDTH)
        .nodePadding(NODE_PADDING)
        // `sankeyLeft` places each node at its graph depth, and because nodes
        // are `(state, step)` pairs that depth *is* the step. Column position
        // therefore means "step N" exactly, which is what the axis below the
        // diagram claims. `sankeyJustify` would push terminal states to the
        // right-hand edge regardless of when they were reached, breaking that.
        .nodeAlign(sankeyLeft)
        .extent([
          [1, 6],
          [width - 1, height - 6],
        ])({ nodes, links });
    } catch {
      // A cyclic graph reaches here only if collapsed mode was forced on;
      // the caller falls back to the expanded graph.
      return null;
    }

    const byKey = new Map(laidOut.nodes.map((n) => [n.key, n]));
    const colorIndexOf = (stateId: string) => stateOrder.get(stateId) ?? 0;

    const outNodes: LaidOutNode[] = graph.nodes.map((node) => {
      const placed = byKey.get(node.key);
      return {
        ...node,
        x0: placed?.x0 ?? 0,
        x1: placed?.x1 ?? 0,
        y0: placed?.y0 ?? 0,
        y1: placed?.y1 ?? 0,
        colorIndex: colorIndexOf(node.stateId),
      };
    });

    const outLinks: LaidOutLink[] = graph.links.map((link, i) => {
      const placed = laidOut.links[i];
      const source = typeof placed?.source === "object" ? placed.source : undefined;
      const target = typeof placed?.target === "object" ? placed.target : undefined;
      const linkWidth = placed?.width ?? 0;

      const path =
        source && target && placed?.y0 !== undefined && placed?.y1 !== undefined
          ? ribbonPath({
              source,
              target,
              y0: placed.y0,
              y1: placed.y1,
              width: linkWidth,
            })
          : "";

      return { ...link, path, width: linkWidth, colorIndex: colorIndexOf(link.fromStateId) };
    });

    return { nodes: outNodes, links: outLinks, width, height };
  }, [graph, stateOrder, availableWidth]);
}
