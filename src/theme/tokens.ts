/**
 * Design tokens — the single source of truth for colour in the app.
 *
 * These objects drive both the CSS custom properties (emitted at startup by
 * `installThemeTokens`) and the Chart.js option factories, so the SVG diagram
 * and the canvas charts cannot drift apart.
 *
 * The categorical ramp is the validated default palette from the dataviz
 * reference. Both modes pass the lightness band, chroma floor, adjacent-pair
 * CVD separation (worst ΔE 9.1 light / 8.4 dark) and the normal-vision floor
 * (19.6 / 19.3). Three light-mode slots sit under 3:1 against the surface, so
 * the relief rule applies: every Sankey node is direct-labelled and the results
 * panel ships a table view. Assign slots in fixed declaration order and never
 * cycle them — a ninth state falls back to `seriesOverflow`.
 */

export type ColorScheme = "light" | "dark";

export interface ThemeTokens {
  /** Page plane, behind the cards. */
  plane: string;
  /** Card and chart surface. */
  surface1: string;
  /** Raised elements: inputs, table headers, popovers. */
  surface2: string;
  /** Hover wash. */
  surface3: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  gridline: string;
  baseline: string;
  border: string;
  /** Categorical slots, in fixed order. */
  series: readonly string[];
  /** Used past the eighth entity, where hue can no longer carry identity. */
  seriesOverflow: string;
  /** Faint stroke for individual Monte Carlo traces. */
  trace: string;
  /** Fill for the P5–P95 band. */
  band: string;
  good: string;
  warning: string;
  serious: string;
  critical: string;
  /** Selection accent, distinct from slot 1 so a selected run reads as its own thing. */
  accent: string;
}

const CATEGORICAL_LIGHT = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

export const LIGHT: ThemeTokens = {
  plane: "#f9f9f7",
  surface1: "#fcfcfb",
  surface2: "#f2f2ee",
  surface3: "#ebebe5",
  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
  border: "rgba(11, 11, 11, 0.10)",
  series: CATEGORICAL_LIGHT,
  seriesOverflow: "#898781",
  trace: "rgba(42, 120, 214, 0.16)",
  band: "rgba(42, 120, 214, 0.14)",
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  accent: "#eb6834",
};

export const DARK: ThemeTokens = {
  plane: "#0d0d0d",
  surface1: "#1a1a19",
  surface2: "#232322",
  surface3: "#2c2c2a",
  textPrimary: "#ffffff",
  textSecondary: "#c3c2b7",
  textMuted: "#898781",
  gridline: "#2c2c2a",
  baseline: "#383835",
  border: "rgba(255, 255, 255, 0.10)",
  series: CATEGORICAL_DARK,
  seriesOverflow: "#898781",
  trace: "rgba(57, 135, 229, 0.20)",
  band: "rgba(57, 135, 229, 0.18)",
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  accent: "#d95926",
};

export const THEMES: Record<ColorScheme, ThemeTokens> = { light: LIGHT, dark: DARK };

/**
 * Colour for the nth entity in a fixed list (a Markov state, in practice).
 * Past the eighth slot everything shares one neutral, because inventing a
 * ninth hue would put two indistinguishable colours on screen.
 */
export function seriesColor(tokens: ThemeTokens, index: number): string {
  return tokens.series[index] ?? tokens.seriesOverflow;
}

/** `#rrggbb` → `rgba(r, g, b, alpha)`. Passes through non-hex input unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = Number.parseInt(match[1]!, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * CSS custom property name for a token key: `textPrimary` → `--text-primary`,
 * `surface1` → `--surface-1`. Digits need their own dash — camelCase alone
 * would leave `surface1` as `--surface1` and silently break every rule
 * referencing it.
 */
export function cssVarName(key: string): string {
  const kebab = key
    .replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    .replace(/(\d+)/g, "-$1");
  return `--${kebab}`;
}

function declarations(tokens: ThemeTokens): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (key === "series") {
      (value as readonly string[]).forEach((hex, i) => {
        lines.push(`  --series-${i + 1}: ${hex};`);
      });
    } else {
      lines.push(`  ${cssVarName(key)}: ${value as string};`);
    }
  }
  return lines.join("\n");
}

/**
 * Emits the token custom properties as a stylesheet.
 *
 * Dark values are declared under both the media query (OS setting) and the
 * `[data-theme]` scope (explicit toggle), so the toggle wins in both
 * directions while the default "system" setting still resolves correctly.
 */
export function themeStylesheet(): string {
  return [
    `:root {\n  color-scheme: light;\n${declarations(LIGHT)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n    color-scheme: dark;\n${declarations(DARK)}\n  }\n}`,
    `:root[data-theme="dark"] {\n  color-scheme: dark;\n${declarations(DARK)}\n}`,
  ].join("\n\n");
}
