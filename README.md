# Markov Monte Carlo

A frontend-only tool for exploring causal scenarios expressed as Markov chains.

A scenario is a **self-contained JSON file** describing states, transition probabilities,
and a downstream causal chain of variables. The app runs Monte Carlo rollouts through that
chain and shows both the aggregate probability flow and the individual rollouts — including
the exact path any single run took.

Probabilities are editable live in the diagram; the JSON stays in charge of *which*
transitions exist.

```bash
bun install
bun run dev       # http://localhost:5173
bun test          # engine + state + theme unit tests
bun run build     # tsc --noEmit && vite build
```

Requires [bun](https://bun.sh). No backend, no network calls — everything runs in the browser.

## What's on screen

**Left — the chain.** A Sankey diagram whose nodes are `(state, step)` pairs and whose ribbon
widths are runs (or declared probability mass, via the Sampled/Declared toggle). Hovering a
box shows the author's notes; clicking it opens that state's outgoing probabilities with
sliders, per-row locks, and live renormalization. Below it, the causal chain: one card per
variable, each with an editable conditional probability table.

**Right — the results.** Four views over the same runs and the same selection:

| View | Shows |
|---|---|
| Distribution | Histogram of a numeric outcome, with P5/P50/P95 and mean |
| Run traces | Individual runs overlaid, over a P5–P95 band computed from *all* runs |
| Outcomes | Counts per terminal state or category; click to filter |
| Run table | Every run, sortable and windowed |

Selecting a run anywhere highlights it everywhere — including its exact path through the
Sankey — and opens a step-by-step history showing the probability of each branch it took.

Below that, settings: run count, seed, step count, scenario import/export, and rerun.

## Scenario format

Scenarios live in [`scenarios/`](scenarios), outside `src/` — a scenario is authored content,
not application source. Dropping a `.json` file into that folder registers it automatically;
there is no manifest to update. The three bundled examples are the reference:

- **`macro-gdp.json`** — fixed-horizon macro chain: regimes → policy rate → inflation → GDP growth.
- **`startup-funding.json`** — absorbing funnel: seed → Series A/B/C → IPO / acquisition / acquihire / shutdown.
- **`credit-migration.json`** — rating migration with default as an absorbing state inside a fixed horizon.

The format is defined once, in [`src/engine/schema.ts`](src/engine/schema.ts). Invalid files
produce a readable list of problems rather than a crash.

```jsonc
{
  "id": "startup-funding",
  "name": "Startup funding rounds → exit",
  "mode": "absorbing",          // "absorbing" | "horizon"
  "maxSteps": 8,
  "seed": 1337,

  "states": [
    { "id": "seed", "label": "Seed", "notes": "Free-form text. Shown on hover — sources and citations go here." },
    { "id": "ipo",  "label": "IPO", "terminal": true, "category": "success" }
  ],

  "initial": { "seed": 1.0 },   // start weights, normalized

  "transitions": {
    "seed": [
      { "to": "seriesA",  "p": 0.35, "notes": "Per-transition notes work too." },
      { "to": "shutdown", "p": 0.65 }
    ]
  },

  // Ordered causal chain. Each variable conditions on ONE parent: "$state",
  // or a variable declared before it.
  "variables": [
    {
      "id": "roundSize", "label": "Round size", "parent": "$state", "unit": "$M",
      "levels": [
        { "id": "small", "label": "Small ($0.5–3M)", "range": [0.5, 3.0] },
        { "id": "mid",   "label": "Mid ($3–15M)",    "range": [3.0, 15.0] }
      ],
      "cpt": {
        "seed":    { "small": 0.75, "mid": 0.25 },
        "seriesA": { "small": 0.10, "mid": 0.90 }
      }
    }
  ],

  "outcomes": [
    { "id": "exit", "label": "Exit outcome", "kind": "categorical",
      "source": { "type": "terminalState" } },
    { "id": "size", "label": "Final round size", "kind": "numeric", "unit": "$M",
      "source": { "type": "variable", "variableId": "roundSize" } }
  ]
}
```

### Field notes

**`mode`** — `absorbing` follows transitions until a terminal state (bounded by `maxSteps`),
so runs vary in length. `horizon` runs for exactly `maxSteps` periods; a terminal state
reached early self-loops for the remainder, which keeps every column of the Sankey carrying
the full population.

**`notes`** — free-form, on states, transitions, variables and outcomes. Whitespace is
preserved and bare URLs become links. This is where sources and reasoning go.

**`variables`** — declaration order *is* causal order. A variable may only condition on
something declared before it, which makes a dependency cycle impossible to express. Each
variable is drawn once per step, conditioned on its parent at that same step, so a run
yields a genuine series in `horizon` mode and one reading per hop in `absorbing` mode.

**`cpt`** — one weight distribution per parent value. Rows must cover every value the parent
can take, or include a `"*"` fallback row. Weights are relative and get normalized.

**`outcomes`** — read off the final step. `numeric` requires a `variable` source; `categorical`
takes `variableLevel`, `terminalState`, or `stateCategory`. A scenario can declare as many as
it likes, and the results panel switches between them.

## Architecture

The engine is pure TypeScript with no React import anywhere, so scenarios stay data and the
UI can be developed against a stable surface.

```
scenarios/           # authored JSON — the data, kept out of the source tree
src/
├── engine/          # simulation core — pure, tested, framework-free
│   ├── types.ts     schema.ts      # data model + zod validation
│   ├── rng.ts       sample.ts      # seeded PRNG, weighted sampling
│   ├── markov.ts    variables.ts   # path rollout, CPT evaluation
│   ├── simulate.ts  stats.ts       # Monte Carlo driver, histograms/percentiles
│   └── sankey.ts                   # run paths → flow graph (sampled + analytic)
├── scenarios.ts     # loader; discovers ../scenarios/*.json via import.meta.glob
├── state/           # zustand store; edits held as an overlay on the file
├── theme/           # design tokens → CSS custom properties + chart colours
├── charts/          # Chart.js registration and shared option factories
└── components/      # chain/ · results/ · settings/ · common/
```

Two decisions worth knowing:

**Edits are an overlay, not a mutation.** `state/edits.ts` keeps changed distributions
separate from the loaded file, so "reset to file" is a delete, the UI can mark what has
drifted, and export emits a valid scenario with the edits baked in.

**Determinism is load-bearing.** Each run draws from its own seed derived from
`(seed, runIndex)`, so a given run is reproducible on its own and raising the run count
extends the results rather than reshuffling them. Same seed in, byte-identical results out —
which is what makes "click a run to see its history" and before/after comparison trustworthy.

## CI and deployment

Two workflows, both on bun:

- **[`ci.yml`](.github/workflows/ci.yml)** — on every push to `main` and every pull request:
  `bun test`, `bun run typecheck`, `bun run build`. The test run validates every file in
  `scenarios/`, so a malformed scenario fails CI rather than the app.
- **[`deploy.yml`](.github/workflows/deploy.yml)** — on push to `main`, publishes to GitHub
  Pages. It re-runs the tests before building so a broken build cannot reach the published
  site.

The site is static, so nothing but the built `dist/` is deployed. Vite's `base` comes from
`BASE_PATH`, which the deploy workflow feeds from `actions/configure-pages` rather than
hardcoding — a project site gets `/<repo>/`, a custom domain gets `/`, and both work without
editing the config.

To enable it: **Settings → Pages → Build and deployment → Source: GitHub Actions**, then push
to `main`. Note that Pages on a **private** repository requires a paid GitHub plan; on a free
account the deploy job will fail until the repo is made public.

Reproduce a Pages-style build locally:

```bash
BASE_PATH=/markov-monte-carlo bun run build
```

## Colour

Charts and diagram share one validated palette (`src/theme/tokens.ts`). Categorical slots are
assigned in fixed declaration order and never cycled — a ninth state falls back to a neutral
rather than reusing a hue. The palette passes CVD separation and normal-vision floors in both
light and dark mode; three light-mode slots sit under 3:1 against the surface, which is why
every Sankey node is direct-labelled and the run table view always exists.
