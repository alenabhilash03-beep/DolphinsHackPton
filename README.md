# Hypothesim

An evidence-aware scientific hypothesis exploration platform.

## Full development plan

**[Read the complete 36-hour implementation plan](docs/IMPLEMENTATION_PLAN.md).** It contains every phase and subphase, dependencies, interfaces, tests, cutoffs, risks, parallel work, and the demo strategy. The scientific specification and source audit are in [docs/model.md](docs/model.md) and [docs/evidence-policy.md](docs/evidence-policy.md). Completed-chunk reviews are in [docs/subphase-reviews](docs/subphase-reviews).

## Current progress

**Phases 0–3 and subphase 4A are complete.** The repository has the evidence audit, canonical scientific contracts, exact one-compartment PK, adaptive mass-action binding, numerical comparisons, direct simulation API, functional technical workspace, audited trastuzumab evidence registry, and a guarded LangChain agent. Research jobs now connect the hypothesis form to validated experiments, factual progress events, plots, and result-linked interpretation. The [3B review](docs/subphase-reviews/3B.md) records the verified remote LangSmith trace; the [3C review](docs/subphase-reviews/3C.md) records the end-to-end workspace check.

The web preview and API can be run locally now using the commands below. Python computation is independent of the agent; no AI credentials are needed to run the numerical engine.

The [frontend integration handoff](docs/FRONTEND_INTEGRATION.md) documents same-origin simulation routes, a typed client, a headless React workspace hook, linked parameter controls, provenance, and rapid-edit behavior. The separate technical preview route [`/preview/plots`](http://127.0.0.1:3000/preview/plots) contains working controls, Plotly comparisons, a synchronized timeline, and a read-only evidence panel. A separate UI contributor can use these components without keeping the preview's plain styling. The root page remains the engine preview. The [research evidence contract](docs/RESEARCH_EVIDENCE.md) explains the curated profile, bibliographic cache, live search, and their distinct statuses.

The [3B agent contract](docs/RESEARCH_AGENT.md) explains the supported research request, LangChain tools, result validation, and local versus remote trace checks. The [research job contract](docs/RESEARCH_JOBS.md) describes the asynchronous API, SSE progress, failure behavior, and frontend handoff.

## Requirements and installation

- Python 3.12 (3.13 is also allowed by the project).
- Node.js 22 or newer; npm.
- [uv](https://docs.astral.sh/uv/) for the locked Python environment.

Run from the repository root:

```sh
uv sync --locked
npm ci
cp .env.example .env
```

Skip the copy if `.env` already exists. Both services load the root `.env`; never commit it. Python dependencies are locked in `uv.lock`, Node dependencies in `package-lock.json`. Keep those files with the corresponding manifest changes.

## Start locally

In one terminal:

```sh
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```sh
npm run dev:web
```

Open [http://127.0.0.1:3000/preview/plots](http://127.0.0.1:3000/preview/plots) for the functional Phase 3 workspace. Its form submits a hypothesis to the guarded research agent, shows factual progress, and loads the validated experiment, interpretation, and synchronized Plotly comparison. Sliders rerun the deterministic numerical engine directly. An unsupported or failed research job leaves the existing simulation usable. The root page remains an engine preview.

- API health: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).
- API reference: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).
- OpenAPI: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json).
- Direct simulation: `POST http://127.0.0.1:8000/api/simulations`. In the API reference, expand this operation and use **Try it out** with `data/examples/contract-experiment.json` as the `experiment` field, `client_revision` set to `0`, and `output_points` set to `100` or more. The complete checked-in response is [data/examples/simulation-result.reference.json](data/examples/simulation-result.reference.json).

Set `API_BASE_URL` to change the server-to-server destination; restart Next.js after environment changes. No provider keys are sent to browser code. Health reports credential presence, not successful authentication or model validation.

## Scientific contracts

`apps/api/app/schemas/contracts.py` owns the contracts. Do not edit generated files manually.

```sh
uv run npm run contracts:generate
npm run contracts:check
npm run typecheck
npm run test:workspace --workspace apps/web
uv run pytest
npm run build
```

The `uv run` wrapper ensures the generation script uses the project's Python environment. Generation exports OpenAPI and standalone JSON Schema, creates TypeScript definitions, and emits a normalized typed example. JavaScript validates the original JSON fixture against JSON Schema. TypeScript checks the normalized example against generated API types. The Python server additionally enforces cross-field scientific constraints and provenance, which JSON Schema alone does not express.

Committed generated files:

- `contracts/openapi.json`
- `contracts/experiment.schema.json`
- `apps/web/lib/contracts.generated.ts`
- `apps/web/lib/example.generated.ts`

After changing schemas or the example, regenerate and review these outputs. `data/examples/contract-experiment.json` is an auditable contract fixture; it is not the Phase 3 runtime drug registry.

Implemented validation includes finite canonical numerical inputs, linked PK/affinity values, nonoverlapping infusion schedules, source and assumption references, reviewed evidence chains, canonical evidence units, conditional scope for assumed inputs, and separation of blocked outcomes from runnable configurations. The API enforces the registered model and computational limits. Runtime research and model suitability beyond the registered example remain later gates.

## Free NVIDIA compatibility check

The user selected NVIDIA's hosted **Nemotron 3.5 Super VL** candidate after identifying a zero-budget constraint. No OpenAI API key, paid-provider fallback, or local model download is required.

The [audited model page](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b) currently lists a free prototype endpoint, function calling, and structured output. Access is subject to NVIDIA account access, endpoint availability, and limits; documentation is not proof that this account can invoke it. Recheck free status before changing endpoints or deploying.

1. Sign in on the model page and generate an API key.
2. Set the following in root `.env`:

```dotenv
NVIDIA_API_KEY=replace_locally
HYPOTHESIM_LLM_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
```

3. Run:

```sh
uv run python scripts/check_ai.py --live
```

This explicitly calls NVIDIA. It requires the model to execute two tools, preserve a random marker from a tool result, return structured output through LangChain's validated response tool, and leave unavailable rates/citations empty. A passing probe establishes limited integration capability, not overall research quality. Do not call a scripted offline test a live model test.

Use `--challenge` to add pressure to invent missing values. `--strategy native` is a diagnostic alternative: the initial 0B native-format run returned without executing the required tools and was rejected. The tool strategy is the selected integration path; schema validation alone never establishes that research tools ran.

For a trace that can be read back, create a LangSmith Personal Access Token, set `LANGSMITH_API_KEY`, set `LANGSMITH_TRACING=true`, and use:

```sh
uv run python scripts/check_ai.py --live --require-tracing
```

The [LangSmith setup guide](https://docs.langchain.com/langsmith/create-account-api-key) explains token creation. Set the appropriate `LANGSMITH_ENDPOINT` and optional `LANGSMITH_WORKSPACE_ID` for your account. No automatic paid upgrade or overage opt-in is part of this setup. The project does not require tracing to boot its API or frontend.

The script prints capability status and error categories, not secrets or raw HTTP requests. It does not persist credentials or silently switch providers. If credentials or free access are unavailable, record live verification as pending. Health intentionally does not claim this check has passed; a saved dated verification record is separate from current service state.

## Next development step and when the app becomes visible

**4A is complete.** The workspace now includes the cached experimental 1N8Z structure with chain controls, surfaces, interface highlighting, residue inspection, and camera controls. The [4A review](docs/subphase-reviews/4A.md) records verification and scientific scope. Next is **4B**, the primary hypothesis walkthrough with metric comparisons and evidence presentation, after the next green light.
