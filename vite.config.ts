import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * Vite wants a base that both starts and ends with "/".
 *
 * The deploy workflow feeds this from `actions/configure-pages`, which emits
 * "/repo-name" for a project site and "/" for a user site or custom domain —
 * neither with a trailing slash. Normalising here rather than in YAML keeps the
 * workflow from having to produce "//" in the root case.
 */
function normalizeBase(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

export default defineConfig({
  // GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
  // so built asset URLs need that prefix. Local dev and `vite preview` keep "/".
  base: normalizeBase(process.env.BASE_PATH),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
