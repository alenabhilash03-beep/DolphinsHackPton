# Frontend integration contract for the visual UI

This document is the handoff for the person building Hypothesim's visual frontend. The numerical engine, control resolution, and provenance rules live on the FastAPI server. The frontend can use the headless React hook below without adopting any current page layout or styling.

## Start with the hook

```tsx
"use client";

import { example } from "../lib/example.generated";
import { useExperimentWorkspace } from "../hooks/useExperimentWorkspace";

export function Workspace() {
  const workspace = useExperimentWorkspace(example, 1000);
  // Render your own controls, charts, and evidence cards using workspace data.
  // Example: await workspace.applyControl("pk.elimination_half_life_h", 600);
  return <div>{workspace.status}</div>;
}
```

Pass a stable `ExperimentConfig` object. The hook runs the initial experiment on mount, returns the authoritative `experiment` and `result`, and uses the Next.js same-origin routes. The hook itself has no styling. When a research job returns both `experiment` and `result`, pass both to `useExperimentWorkspace(experiment, 600, result)` to load the validated solver result immediately without recomputing it. Mount a new workspace instance for a new research result; later parameter edits still call the direct solver.

Returned values and actions:

| Value/action | Meaning |
| --- | --- |
| `experiment` | Latest server-validated configuration, including derived linked values, evidence, and custom-mode label |
| `result` | Latest `SimulationResult` or `null` before the first successful run |
| `status`, `busy`, `error` | `idle`, `loading`, `ready`, or `error`; render actionable API errors |
| `pendingEdits` | Number of unsent control edits; `busy` covers pending and in-flight work |
| `lastTransportMs`, `lastEditToResultMs` | Measured API round trip and latest edit-to-settled-result time in milliseconds; `null` until available |
| `baseline`, `alternatives`, `editableScenarioIds` | Baseline is the first scenario and remains protected from scenario edits |
| `selectedScenarioId`, `selectAlternative(id)` | Select the alternative to edit |
| `applyControl(field, value)` | Submit one linked control edit and simulation in one request; resolves to `true` on success |
| `resetToInitial()` | Restore the original reviewed configuration and rerun it |
| `refresh()` | Rerun the current configuration without changing parameters |

The UI should display values from `workspace.experiment` after a successful response. Do not compute clearance, half-life, or KD independently in a widget and then advertise that value as authoritative. Keep sliders interactive while `busy`: the controller coalesces rapid edits to one field with a 150 ms debounce and queues different fields in order. It publishes a new authoritative result only after the queue settles, so an intermediate or stale response cannot replace the displayed comparison. A newer edit to the in-flight field aborts the superseded request. Keep a local slider draft for immediate thumb movement and clear it when the authoritative configuration arrives. On a server error, the hook retains the last valid experiment/result and exposes `error`; offer reset or retry.

## Control fields

Scenario controls require `selectAlternative` first. The first/baseline scenario is protected by both client and server.

| Field | Unit and behavior |
| --- | --- |
| `pk.volume_L` | L; holds clearance fixed and derives effective half-life |
| `pk.clearance_L_h` | L/hour; derives effective half-life |
| `pk.elimination_half_life_h` | hour; derives clearance at fixed volume |
| `binding.association_nM_inv_h_inv` | nM⁻¹ hour⁻¹; derives KD |
| `binding.dissociation_h_inv` | hour⁻¹; derives KD |
| `binding.affinity_nM` | nM; holds association fixed and derives dissociation |
| `exposure_factor` | dimensionless prescribed central-to-site mapping; zero is allowed |
| `dose_mg` | mg; sets the amount of every infusion event in the selected alternative |
| `dosing_interval_h` | hour; produces a repeated finite-infusion schedule within the horizon; `null` returns to a single infusion |

Global controls omit a scenario ID and affect the comparison equally: `duration_h` (hour) and `occupancy_threshold` (fraction strictly between 0 and 1). A duration shorter than an already scheduled dose is rejected with an actionable error; adjust the schedule first. The interval generator uses the first infusion for the initial dose and, when present, the second infusion for subsequent doses. It is a user-defined mathematical schedule, not a newly recommended clinical regimen. Bolus schedules are not edited by the dose/interval controls in this subphase.

Changing a scientific parameter makes the experiment `mode="custom"` and keeps support `conditional`. The original reviewed evidence remains in the configuration. The user's new value is `user_supplied`, `candidate`, timestamped, and labeled unreviewed; a linked mathematical derivation is `calculated`, `candidate`, with parent IDs. The UI must not display those new values as source-reported or clinically reviewed. The 90% default threshold is an analytical choice, not a therapeutic cutoff.

`apps/web/lib/log-control.ts` provides `KINETIC_RANGES`, `toLogPosition`, and `fromLogPosition` for association, dissociation, and KD sliders. The ranges are interface bounds, not literature support or model validity limits. `PreviewControls` is a working native-control example at `/preview/plots`; replace its presentation as needed. When a user changes KD, the backend holds association fixed and derives dissociation. Changing either rate derives KD. Display the returned linked values and provenance.

## Direct API access

The same-origin routes are `POST /api/simulations` and `POST /api/simulations/adjust`. They forward to FastAPI without exposing `API_BASE_URL` or AI provider credentials to browser code. The typed helpers are `simulate` and `adjustAndSimulate` in `apps/web/lib/simulation-client.ts`. The API request and result types are exported from `apps/web/lib/contracts.ts` and generated from the Python OpenAPI schema. Avoid editing `contracts.generated.ts` manually.

The adjustable route accepts `{experiment, scenario_id, field, value, client_revision, output_points}` and returns a complete `SimulationResult`. Its `configuration` is the updated authoritative experiment. A validation failure returns HTTP 422 and leaves the hook's last valid configuration/result in place. A network/server failure returns a retryable error. Parameter edits call no LLM.

For graphs, use `result.time_h` as the only x-axis. Every scenario's `central_concentration_nM`, `target_site_concentration_nM`, and `occupancy` arrays are aligned to it. `result.diagnostics.event_boundaries_h` identifies dosing boundaries. `result.scenarios[*].metrics.threshold.above_threshold_intervals_h` identifies threshold spans. The output contains early-time samples and a pre-bolus sample, but dose/affinity changes do not alter PDB geometry.

## Plots, controls, and synchronized timeline (2B–2C)

The functional chart and timeline components are separate from the root page design. See `/preview/plots` while both local services are running. It mounts the real 0B fixture and demonstrates the following composition:

```tsx
const workspace = useExperimentWorkspace(example, 600);
const timeline = useSimulationTimeline(workspace.result);

{workspace.result && <>
  <TimelineControls timeline={timeline} />
  <ScientificPlot result={workspace.result} kind="concentration"
    cursorTimeHours={timeline.timeHours} onSeekTime={timeline.seekTime} />
  <ScientificPlot result={workspace.result} kind="occupancy"
    cursorTimeHours={timeline.timeHours} onSeekTime={timeline.seekTime} />
</>}
```

Import `useSimulationTimeline` from `apps/web/hooks/useSimulationTimeline.ts`, and `ScientificPlot` and `TimelineControls` from `apps/web/components`. The hook exposes `play`, `pause`, `toggle`, `seekTime`, `seekIndex`, `playing`, `timeHours`, `timeDays`, `progress`, and `readout`. Its readout values come from the exact selected sample index; both charts use the same cursor time. The native controls can be styled or replaced with the UI team's design. The range input represents physical elapsed time, then snaps to the nearest returned sample.

`ScientificPlot` accepts `className`, an optional `showTargetSite` concentration overlay, and an optional `onSeekTime` callback so chart clicks scrub the timeline. It renders Plotly only in the browser. The x-axis is days (backend hours divided by 24); central concentration is nM, and occupancy is percent (backend fraction multiplied by 100). Colors are stable across both charts. Dose starts and event boundaries are marked. The occupancy graph marks the selected analytical threshold. Concentration lines break at a hypothetical bolus; binding occupancy remains continuous.

During playback, `ScientificPlot` keeps the Plotly trace arrays and layout stable. A positioned cursor overlay follows the shared timeline and recalculates its pixel position after zoom or resize. Preserve this separation when changing chart styling; rebuilding the Plotly traces on every frame causes visible stutter.

## Local checks

```sh
uv run pytest
npm run test:workspace --workspace apps/web
npm run typecheck
npm run build
```

The current root page is only an engine preview. The visual UI developer can replace that page and its styles while keeping the hook, generated types, and API routes.

## Research handoff (3C)

`HypothesisWorkspace` in `apps/web/components/HypothesisWorkspace.tsx` is the plain functional flow for natural-language submission. It uses `POST /api/research/jobs`, `GET /api/research/jobs/{id}`, and SSE `/api/research/jobs/{id}/events`; the Next.js proxy is in `apps/web/lib/research-proxy.ts`. The generated `ResearchJob` and `ResearchEvent` types are exported from `apps/web/lib/contracts.ts`. See [the research job contract](RESEARCH_JOBS.md) for status semantics, failure behavior, and interpretation/result linkage. Preserve the result ID check when rendering agent claims after a slider edit.

## Evidence handoff (3A)

`EvidencePanel` in `apps/web/components/EvidencePanel.tsx` accepts the current `workspace.experiment` and optional `workspace.selectedScenarioId`. It renders source links, parameter provenance, scientific limits, and clearly labeled **cached** Europe PMC bibliographic metadata. The same-origin `/api/research/evidence/trastuzumab` route returns the audited profile and cache; generated TypeScript aliases `EvidenceProfile` and `LiteratureSearch` are exported from `apps/web/lib/contracts.ts`.

Keep the experiment's `review_status` and `provenance` separate from `retrieval_status`. A recent live search does not independently validate a numerical parameter, and a user-edited input remains unreviewed even when the original source is still listed. If the evidence metadata route is unavailable, the panel keeps the current experiment's source links and values visible and marks only the cache status unavailable. See [the research evidence contract](RESEARCH_EVIDENCE.md).
