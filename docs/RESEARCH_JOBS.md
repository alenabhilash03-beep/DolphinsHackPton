# Research jobs and workspace handoff (3C)

The scientific API owns the NVIDIA credential and LangChain workflow. The browser calls same-origin Next.js routes, which forward to FastAPI without exposing provider keys. The numerical engine remains independent of the agent.

## API

| Route | Purpose |
| --- | --- |
| `POST /api/research/jobs` | Accept a `HypothesisRequest`; return `202` and a persisted `ResearchJob` with `job_id`. |
| `GET /api/research/jobs/{job_id}` | Read status, support assessment, validated configuration, result, interpretation, retrieval and trace metadata. |
| `GET /api/research/jobs/{job_id}/events` | Stream `ResearchEvent` records as SSE `progress` events with monotonically increasing IDs. `Last-Event-ID` replays missed events. |

Statuses are `queued`, `running`, `completed`, `unsupported`, and `failed`. Progress entries correspond to actual transitions or completed profile, literature, and simulation tools; they are not invented token-by-token agent thoughts. The SQLite file is `data/research-jobs.db` and is ignored by Git. Jobs interrupted by a server restart become `failed` with an explicit retry message. This is a single-process hackathon job runner; deployment with multiple API workers needs a shared queue or database coordination.

`completed` includes the full `ExperimentConfig`, `SimulationResult`, and `Interpretation`. The interpretation's experiment and result IDs must match the numerical result. `unsupported` includes the scope reasons and no model output. Provider errors are sanitized into a short `failed` status and do not reveal credentials or provider payloads. `previous_experiment_id` records lineage for a subsequent request; only the registered experiment ID is accepted at present. Research supports the audited primary trastuzumab–HER2 comparison only.

## Frontend handoff

`HypothesisWorkspace` in `apps/web/components/HypothesisWorkspace.tsx` is a functional form and activity view for the UI contributor to restyle. It submits the request, listens for SSE progress, polls saved status as a fallback, and passes the completed `experiment` and `result` to `PlotPreview`. The workspace controller accepts that initial result without recomputing it. Parameter controls call `/api/simulations/adjust` directly. When controls produce a new result ID, the original agent interpretation is hidden because it applies only to the original result. Failed or unsupported research preserves the last valid direct simulation.

The `/preview/plots` page demonstrates the complete data path. The root page is still an engine preview. The 3D molecular viewer belongs to Phase 4.
