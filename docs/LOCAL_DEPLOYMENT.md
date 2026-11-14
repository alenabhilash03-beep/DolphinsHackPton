# Local demo operation (5B)

The supported deployment for this milestone is two local processes: Next.js and one FastAPI service. Research runs in supervised child processes; slider calculations remain direct scientific API calls. Public hosting is not part of this acceptance gate.

## First installation

From the repository root, install Python 3.12/3.13, Node.js 22+, npm, and uv. Then run:

```sh
uv sync --locked
npm ci
```

Keep the existing local `.env`. For a fresh checkout only, copy `.env.example` to `.env`; add NVIDIA and optional LangSmith credentials locally. No credentials are needed for the saved demo or direct solver. No OpenAI paid-provider fallback is configured.

## Launch and stop

```sh
uv run python scripts/start_local.py --build
```

Open `http://127.0.0.1:3002/preview/plots`. The launcher binds FastAPI to `127.0.0.1:8001`, sets Next.js's server-only `API_BASE_URL`, checks readiness, and prints the workspace URL. Ctrl+C stops both process groups. Logs are written to ignored `work/local-*.log`. The launcher never terminates an unrelated process occupying a port; choose `--api-port` and `--web-port` or stop the old service yourself.

To deliberately run without AI:

```sh
uv run python scripts/start_local.py --offline-research
```

This disables AI and tracing credentials only for that launch; it does not edit `.env`. Click **Open saved demo · no live research** for the labeled saved comparison. The structure and renderer are local assets. Plots, timeline, and schematic work from the snapshot even if FastAPI is unavailable. Parameter edits need FastAPI; if it is down, the UI preserves the last result and shows an error. With FastAPI available, saved-demo controls run the current deterministic solver.

## Health and smoke verification

```sh
uv run python scripts/start_local.py --api-port 8011 --web-port 3011 --offline-research --smoke
```

The command starts clean services, verifies credential absence, the workspace, saved-demo identity, direct simulation through the frontend, and the local molecular assets, then stops the services. It makes no live research requests. API references are available at `/docs`; `/api/health` reports credential presence and `/api/demo` returns the typed saved snapshot.

## Research recovery

- Default deadline: 180 seconds from submission, including queue wait. Configure `RESEARCH_TIMEOUT_S` (up to 600 seconds) and `RESEARCH_MAX_JOBS` (default four accepted running/queued jobs, maximum eight).
- Two supervisor threads run isolated workers. On deadline or shutdown, the supervisor terminates the worker; a watchdog also stops a worker if its parent dies. Terminal status cannot be overwritten by late output. Saturation returns HTTP 429 and `Retry-After` without blocking direct simulation.
- Job rows and factual SSE events persist in `data/research-jobs.db`, or `RESEARCH_DB_PATH`. Interrupted work owned by a dead server process becomes an explicit failed job; opening the store for contracts or another read does not cancel a live owner's work.
- The browser remembers its last submitted job ID when local storage is available. Reload reconnects to that saved job. An unknown job offers resubmission rather than an endless loading state. **Retry research** is available after a failed job; saved demo access remains available throughout.
- Provider payloads and credentials are not returned in errors or persisted job outcomes. Unsupported scope still stops before an AI request. Literature outages retain the existing labeled bibliographic-cache path, without promoting candidate parameters.

## Saved asset maintenance and future hosting

`uv run python scripts/prepare_demo.py` regenerates the saved result with the audited profile and current deterministic solver. It writes identical files to `data/demo/` and `apps/web/public/demo/`, with origin, generation timestamp, evidence status, model/solver versions, and matching result/interpretation IDs. Regenerate after an intentional profile or solver change, review the diff, run tests, and rebuild the frontend. Do not regenerate merely to make a saved run look recent.

For a later selected host, use a persistent Python service with the locked scientific dependencies and repository data; configure the writable job database, NVIDIA credentials, tracing region/workspace, and timeout settings on that service. Build and start Next.js separately with its server-side `API_BASE_URL` pointing to FastAPI. Keep SSE unbuffered. The current local API is not an authenticated multi-tenant service; a public release needs its own access and resource policy. Hosted smoke verification awaits a separately chosen destination. The next roadmap work is 7A, not a hosting migration.
