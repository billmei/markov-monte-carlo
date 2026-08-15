import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cssVarName, seriesColor, themeStylesheet, withAlpha, DARK, LIGHT } from "../tokens";

describe("cssVarName", () => {
  test("kebab-cases camelCase keys", () => {
    expect(cssVarName("textPrimary")).toBe("--text-primary");
    expect(cssVarName("seriesOverflow")).toBe("--series-overflow");
  });

  test("separates trailing digits", () => {
    // `surface1` has no uppercase letter, so camelCase splitting alone would
    // emit `--surface1` and silently break every rule using `--surface-1`.
    expect(cssVarName("surface1")).toBe("--surface-1");
    expect(cssVarName("surface2")).toBe("--surface-2");
    expect(cssVarName("surface3")).toBe("--surface-3");
  });

  test("leaves single-word keys alone", () => {
    expect(cssVarName("plane")).toBe("--plane");
    expect(cssVarName("good")).toBe("--good");
  });
});

describe("themeStylesheet", () => {
  const sheet = themeStylesheet();

  test("declares light values at :root and dark under both scopes", () => {
    expect(sheet).toContain(":root {");
    expect(sheet).toContain('@media (prefers-color-scheme: dark)');
    expect(sheet).toContain(':root:not([data-theme="light"])');
    expect(sheet).toContain(':root[data-theme="dark"]');
  });

  test("emits every token in both modes", () => {
    for (const key of Object.keys(LIGHT)) {
      if (key === "series") continue;
      expect(sheet).toContain(`${cssVarName(key)}:`);
    }
    for (let i = 1; i <= LIGHT.series.length; i++) {
      expect(sheet).toContain(`--series-${i}:`);
    }
    expect(sheet).toContain(DARK.surface1);
    expect(sheet).toContain(LIGHT.surface1);
  });

  test("every custom property referenced in index.css is defined", async () => {
    // The regression guard for the `--surface-1` bug: a token that the
    // stylesheet never emits leaves the rule transparent, with no error.
    const css = await Bun.file(join(import.meta.dir, "..", "..", "index.css")).text();
    const referenced = new Set(
      [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!),
    );

    expect(referenced.size).toBeGreaterThan(5);
    const missing = [...referenced].filter((name) => !sheet.includes(`${name}:`));
    expect(missing).toEqual([]);
  });
});

describe("seriesColor", () => {
  test("assigns slots in fixed declaration order", () => {
    expect(seriesColor(LIGHT, 0)).toBe(LIGHT.series[0]!);
    expect(seriesColor(LIGHT, 3)).toBe(LIGHT.series[3]!);
  });

  test("falls back to the neutral past the last slot rather than cycling", () => {
    // Cycling would put two indistinguishable colours on screen.
    expect(seriesColor(LIGHT, LIGHT.series.length)).toBe(LIGHT.seriesOverflow);
    expect(seriesColor(LIGHT, 99)).toBe(LIGHT.seriesOverflow);
  });
});

describe("withAlpha", () => {
  test("converts hex to rgba", () => {
    expect(withAlpha("#2a78d6", 0.5)).toBe("rgba(42, 120, 214, 0.5)");
  });

  test("passes non-hex values through untouched", () => {
    expect(withAlpha("rgba(1, 2, 3, 0.4)", 0.9)).toBe("rgba(1, 2, 3, 0.4)");
  });
});
