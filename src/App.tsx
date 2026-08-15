import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useAppStore } from "@/state/store";
import { brokenScenarios } from "@/scenarios";
import { SankeyDiagram } from "@/components/chain/SankeyDiagram";
import { CausalChainPanel } from "@/components/chain/CausalChainPanel";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { Notes } from "@/components/common/Notes";

/**
 * Two columns: the chain and its editors on the left, results and controls on
 * the right. Collapses to a single stacked column on narrow viewports.
 */
export default function App(): ReactNode {
  const scenario = useAppStore((s) => s.scenario);
  const source = useAppStore((s) => s.source);

  if (!scenario) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>No scenario loaded</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          {brokenScenarios.length > 0
            ? `Every bundled scenario failed validation (${brokenScenarios
                .map((s) => s.file)
                .join(", ")}).`
            : "Add a scenario JSON file to src/scenarios/."}
        </p>
      </div>
    );
  }

  return (
    <Tooltip.Provider delayDuration={280} skipDelayDuration={200}>
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-1)",
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ fontSize: 15, fontWeight: 650, margin: 0 }}>Markov Monte Carlo</h1>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>{scenario.name}</span>
          <span
            style={{
              fontSize: 10.5,
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "1px 6px",
            }}
          >
            {scenario.mode === "horizon"
              ? `${scenario.maxSteps}-step horizon`
              : "absorbing"}
          </span>
          {source ? (
            <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: "auto" }}>
              {source.label}
            </span>
          ) : null}
        </header>

        <div className="app-grid">
          <main style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {scenario.description ? (
              <div
                className="card"
                style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--text-secondary)" }}
              >
                <Notes text={scenario.description} />
              </div>
            ) : null}

            <section className="card" style={{ padding: 14, minWidth: 0 }}>
              <h2 style={{ fontSize: 13, fontWeight: 650, margin: "0 0 10px" }}>
                Markov chain
              </h2>
              <SankeyDiagram scenario={scenario} />
            </section>

            <section className="card" style={{ padding: 14, minWidth: 0 }}>
              <h2 style={{ fontSize: 13, fontWeight: 650, margin: "0 0 4px" }}>Causal chain</h2>
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
                Each variable is drawn at every step, conditioned on the one above it.
              </p>
              <CausalChainPanel scenario={scenario} />
            </section>
          </main>

          <aside style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <section className="card" style={{ padding: 14, minWidth: 0 }}>
              <h2 style={{ fontSize: 13, fontWeight: 650, margin: "0 0 12px" }}>
                Monte Carlo results
              </h2>
              <ResultsPanel scenario={scenario} />
            </section>

            <section className="card" style={{ padding: 14 }}>
              <h2 style={{ fontSize: 13, fontWeight: 650, margin: "0 0 12px" }}>Settings</h2>
              <SettingsPanel scenario={scenario} />
            </section>
          </aside>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
