# Hypothesim

An evidence-aware scientific hypothesis exploration platform. The approved roadmap is in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md); the scientific specification and source audit are in [docs/model.md](docs/model.md) and [docs/evidence-policy.md](docs/evidence-policy.md).

## Current foundation

Subphase 0B provides a Next.js starter, FastAPI health/configuration-validation endpoints, authoritative Pydantic contracts, generated TypeScript/OpenAPI/JSON Schema, and a three-scenario example based on 0A. The example is configuration data, not a computed result. Numerical simulation, literature research, plots, and molecular viewers are later subphases.

Python computation will remain independent of the agent. No AI credentials are needed to start or test this foundation.

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

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The page checks the actual API and validates the example through the backend. If the backend is offline, it shows an error and offers retry. It does not display invented simulation results.

- API health: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).
- API reference: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).
- OpenAPI: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json).

Set `API_BASE_URL` to change the server-to-server destination; restart Next.js after environment changes. No provider keys are sent to browser code. Health reports credential presence, not successful authentication or model validation.

## Scientific contracts

`apps/api/app/schemas/contracts.py` owns the contracts. Do not edit generated files manually.

```sh
uv run npm run contracts:generate
npm run contracts:check
npm run typecheck
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

Implemented validation includes finite canonical numerical inputs, linked PK/affinity values, nonoverlapping infusion schedules, source and assumption references, reviewed evidence chains, canonical evidence units, conditional scope for assumed inputs, and separation of blocked outcomes from runnable configurations. Model suitability and numerical execution remain later gates.

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

## Next development step

Finish the 0B acceptance/review record before starting 1A. The next implementation chunk is units, administration, and analytical PK. Apply the roadmap's review after every subphase and wait for the next green light.
