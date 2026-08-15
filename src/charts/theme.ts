import type { Chart, ChartOptions, Plugin, TooltipOptions } from "chart.js";
import type { ThemeTokens } from "@/theme/tokens";

/**
 * Shared Chart.js option factories.
 *
 * Every chart in the results panel goes through here so axes, fonts, grid
 * weight and tooltip styling are defined once rather than re-specified (and
 * quietly diverging) per chart. Chart.js's stock colours and legend styling are
 * replaced wholesale — none of the defaults survive.
 */

const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function tooltipStyle(tokens: ThemeTokens): Partial<TooltipOptions> {
  return {
    backgroundColor: tokens.surface1,
    titleColor: tokens.textPrimary,
    bodyColor: tokens.textSecondary,
    borderColor: tokens.border,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 6,
    displayColors: true,
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 4,
    titleFont: { family: FONT_FAMILY, size: 12, weight: 600 },
    bodyFont: { family: FONT_FAMILY, size: 12 },
  };
}

/** Recessive grid and axes, tabular tick labels, no chart-level animation. */
export function baseOptions(tokens: ThemeTokens): ChartOptions {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    font: { family: FONT_FAMILY },
    layout: { padding: { top: 8, right: 12, bottom: 0, left: 0 } },
    plugins: {
      legend: {
        display: false,
        position: "bottom",
        align: "start",
        labels: {
          color: tokens.textSecondary,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: "rectRounded",
          padding: 14,
          font: { family: FONT_FAMILY, size: 12 },
        },
      },
      tooltip: tooltipStyle(tokens),
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: tokens.baseline },
        ticks: {
          color: tokens.textMuted,
          font: { family: FONT_FAMILY, size: 11 },
          maxRotation: 0,
          autoSkipPadding: 16,
        },
      },
      y: {
        grid: { color: tokens.gridline, lineWidth: 1, drawTicks: false },
        border: { display: false },
        ticks: {
          color: tokens.textMuted,
          font: { family: FONT_FAMILY, size: 11 },
          padding: 8,
        },
      },
    },
  };
}

export interface ValueMarker {
  value: number;
  label: string;
  color: string;
  dash?: number[];
}

/**
 * Draws labelled reference lines at given x values.
 *
 * A hand-rolled plugin rather than `chartjs-plugin-annotation`, which would be
 * a whole dependency for three vertical rules.
 */
export const valueMarkersPlugin: Plugin<"bar"> = {
  id: "valueMarkers",
  afterDatasetsDraw(chart: Chart<"bar">, _args, options: unknown) {
    const config = options as { markers?: ValueMarker[]; labelColor?: string };
    const markers = config?.markers;
    if (!markers?.length) return;

    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    if (!xScale || !chartArea) return;

    ctx.save();
    ctx.font = '600 10px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textBaseline = "top";

    const LABEL_HEIGHT = 12;
    /** Right edge of each label already placed on a given row. */
    const rows: number[] = [];

    for (const marker of markers) {
      if (!Number.isFinite(marker.value)) continue;
      const x = xScale.getPixelForValue(marker.value);
      if (x < chartArea.left || x > chartArea.right) continue;

      ctx.beginPath();
      ctx.setLineDash(marker.dash ?? [4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = marker.color;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();

      // Flip the label inside the plot when the line sits near the right edge.
      const textWidth = ctx.measureText(marker.label).width;
      const flip = x + textWidth + 8 > chartArea.right;
      const left = flip ? x - 4 - textWidth : x + 4;

      // Drop to the next row rather than overprinting a neighbouring label —
      // P50 and the mean often land within a few pixels of each other.
      let row = 0;
      while (row < rows.length && left < (rows[row] ?? 0) + 4) row++;
      rows[row] = left + textWidth;

      ctx.setLineDash([]);
      ctx.fillStyle = marker.color;
      ctx.textAlign = flip ? "right" : "left";
      ctx.fillText(marker.label, flip ? x - 4 : x + 4, chartArea.top + 2 + row * LABEL_HEIGHT);
    }

    ctx.restore();
  },
};

/**
 * Draws each bar's value at its end. Direct labelling is required here rather
 * than optional: three light-mode categorical slots sit under 3:1 against the
 * surface, and the relief rule makes visible labels the mitigation.
 */
export const barValueLabelsPlugin: Plugin<"bar"> = {
  id: "barValueLabels",
  afterDatasetsDraw(chart: Chart<"bar">, _args, options: unknown) {
    const config = options as { color?: string; labels?: string[] } | undefined;
    if (!config?.labels) return;

    const meta = chart.getDatasetMeta(0);
    const { ctx, chartArea } = chart;
    if (!meta || !chartArea) return;

    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = config.color ?? "#000";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    meta.data.forEach((element, i) => {
      const label = config.labels?.[i];
      if (!label) return;
      const { x, y } = element.getProps(["x", "y"], true);
      if (x + 6 > chartArea.right) {
        ctx.textAlign = "right";
        ctx.fillText(label, x - 8, y);
        ctx.textAlign = "left";
      } else {
        ctx.fillText(label, x + 8, y);
      }
    });

    ctx.restore();
  },
};
