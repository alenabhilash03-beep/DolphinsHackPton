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

Pass a stable `ExperimentConfig` object. The hook runs the initial experiment on mount, returns the authoritative `experiment` and `result`, and uses the Next.js same-origin routes. The hook itself has no styling. A Phase 3 agent-prepared experiment can replace `example` later.

Returned values and actions:

| Value/action | Meaning |
| --- | --- |
| `experiment` | Latest server-validated configuration, including derived linked values, evidence, and custom-mode label |
| `result` | Latest `SimulationResult` or `null` before the first successful run |
| `status`, `busy`, `error` | `idle`, `loading`, `ready`, or `error`; render actionable API errors |
| `baseline`, `alternatives`, `editableScenarioIds` | Baseline is the first scenario and remains protected from scenario edits |
| `selectedScenarioId`, `selectAlternative(id)` | Select the alternative to edit |
| `applyControl(field, value)` | Submit one linked control edit and simulation in one request; resolves to `true` on success |
| `resetToInitial()` | Restore the original reviewed configuration and rerun it |
| `refresh()` | Rerun the current configuration without changing parameters |

The UI should display values from `workspace.experiment` after a successful response. Do not compute clearance, half-life, or KD independently in a widget and then advertise that value as authoritative. Disable further edits while `busy` is true in this 2A implementation; Phase 2C will add rapid-edit debounce and more comprehensive stale-response handling.

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

## Direct API access

The same-origin routes are `POST /api/simulations` and `POST /api/simulations/adjust`. They forward to FastAPI without exposing `API_BASE_URL` or AI provider credentials to browser code. The typed helpers are `simulate` and `adjustAndSimulate` in `apps/web/lib/simulation-client.ts`. The API request and result types are exported from `apps/web/lib/contracts.ts` and generated from the Python OpenAPI schema. Avoid editing `contracts.generated.ts` manually.

The adjustable route accepts `{experiment, scenario_id, field, value, client_revision, output_points}` and returns a complete `SimulationResult`. Its `configuration` is the updated authoritative experiment. A validation failure returns HTTP 422 and leaves the hook's last valid configuration/result in place. A network/server failure returns a retryable error. Parameter edits call no LLM.

For graphs, use `result.time_h` as the only x-axis. Every scenario's `central_concentration_nM`, `target_site_concentration_nM`, and `occupancy` arrays are aligned to it. `result.diagnostics.event_boundaries_h` identifies dosing boundaries. `result.scenarios[*].metrics.threshold.above_threshold_intervals_h` identifies threshold spans. The output contains early-time samples and a pre-bolus sample, but dose/affinity changes do not alter PDB geometry.

## Plots and synchronized timeline (2B)

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

## Local checks

```sh
uv run pytest
npm run test:workspace --workspace apps/web
npm run typecheck
npm run build
```

The current root page is only an engine preview. The visual UI developer can replace that page and its styles while keeping the hook, generated types, and API routes.
