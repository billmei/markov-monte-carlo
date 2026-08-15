import { useSyncExternalStore } from "react";
import { THEMES, themeStylesheet, type ColorScheme, type ThemeTokens } from "./tokens";

const STORAGE_KEY = "mmc-theme";
const STYLE_ID = "mmc-theme-tokens";

/** User preference: an explicit choice, or follow the OS. */
export type ThemePreference = ColorScheme | "system";

let preference: ThemePreference = "system";
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function mediaQuery(): MediaQueryList | null {
  return typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)");
}

function resolve(): ColorScheme {
  if (preference !== "system") return preference;
  return mediaQuery()?.matches ? "dark" : "light";
}

/**
 * Injects the token stylesheet and restores the saved preference.
 * Called once from `main.tsx`, before React renders.
 */
export function installTheme(): void {
  if (typeof document === "undefined") return;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = themeStylesheet();
    document.head.prepend(style);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") {
    preference = saved;
  }
  applyAttribute();

  mediaQuery()?.addEventListener("change", () => {
    if (preference === "system") notify();
  });
}

function applyAttribute(): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  localStorage.setItem(STORAGE_KEY, next);
  applyAttribute();
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active scheme, re-rendering on both OS changes and explicit toggles. */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, resolve, () => "light" as const);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    () => preference,
    () => "system" as const,
  );
}

/** The resolved token set. Chart option factories read colours from here. */
export function useThemeTokens(): ThemeTokens {
  return THEMES[useColorScheme()];
}
