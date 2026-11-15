# Hypothesim — handoff

Start here if you are picking this project up, whether you are a person or a new Claude session. Last updated 2026-11-15.

## 1. What it is (30-second version)

Hypothesim is an agentic workflow for exploring drug and antibody hypotheses before lab or clinical work. A researcher asks a question in plain English. An AI agent (NVIDIA Nemotron via LangChain):

1. searches and reads papers (Europe PMC) and extracts **cited** parameter values;
2. assembles and validates an experiment, then runs a **deterministic** pharmacokinetic and binding simulation (SciPy), so curves come from math, not the AI;
3. inspects the real crystal structure (RCSB PDB, 3Dmol viewer) and measures drug–target contacts;
4. writes a grounded answer in which every claim links to a paper quote, a solver value or a structure measurement.

Researchers can run follow-up experiments, keep an investigation history, sign in with Google, and **share** experiments to a community feed with a validated AI summary. Occupancy predictions are conditional model outputs, never claims of efficacy or safety.

## 2. Where things are

| Thing | Location |
| --- | --- |
| Live site | https://hypothesimweb-production.up.railway.app |
| Code | GitHub `alenabhilash03-beep/DolphinsHackPton`, branch **`claude/fervent-planck-cvxgmf`** (all current work; `main` is older and has no Dockerfile) |
| Hosting | Railway: the service behind hypothesimweb-production.up.railway.app; one Docker container (web + API) |
| Sign-in | Supabase project `quxdunkxdtxnjgbxxovc` (Auth → Google provider) + a Google Cloud OAuth client |
| Website code | `frontend/` (the dark glass visual frontend; this is what Railway serves). Science screens in `frontend/app/science` are generated from `apps/web` by `frontend/scripts/sync-science-local.cjs`; `apps/web` stays as the technical source and is not deployed. |
| Roadmap and status | `docs/IMPLEMENTATION_PLAN.md` (canonical) |
| Demo script | `docs/DEMO_EXAMPLES.md` (the two demo questions and what to say) |
| Deployment guide | `docs/DEPLOYMENT.md` |
| Per-chunk reviews | `docs/subphase-reviews/` (latest: `5C.1.md`, `5C.1b.md`, `5C.2.md`) |

## 3. How to change the website

**Push to `claude/fervent-planck-cvxgmf` and Railway redeploys automatically.** No Claude account is needed; any collaborator with push access to the repository can do it.

```bash
git clone https://github.com/alenabhilash03-beep/DolphinsHackPton.git
```

```bash
cd DolphinsHackPton && git checkout claude/fervent-planck-cvxgmf
```

Edit, commit and push to that branch. A build takes about 5–10 minutes, and the site switches over once its health check passes.

### Railway settings that must stay this way

These were the causes of the first failed deploys:

- **Settings → Source → Branch connected to production:** `claude/fervent-planck-cvxgmf` (or `main` after a merge; see below).
- **Settings → Source → Watch Paths:** **empty.** Railway auto-filled `/apps/web/**`, which ignores pushes elsewhere, including `frontend/`.
- **Settings → Deploy → Custom Start Command:** **empty.** Railway auto-filled an `npm` command; `railway.toml` now sets `bash scripts/start_container.sh`, which also takes precedence.
- **Builder:** Dockerfile (from `railway.toml`).
- **Variables:** `NVIDIA_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `PORT=3000`. Values live only in Railway, never in the repo.
- **Volume** mounted at **`/data`**. It holds every user's experiments and the community feed. Without it, data resets on each deploy.
- **Networking:** public domain targets port **3000**.

### Giving another person dashboard access

The repository alone is enough to change the site. For dashboard access, the owner invites them:

- **Railway:** Project → Settings → Members (team features may depend on the Railway plan).
- **Supabase:** Organization → Team.
- **GitHub:** repository → Settings → Collaborators.
- **Google Cloud:** project IAM, only needed to change the OAuth client.

### Moving deploys to `main` (optional)

Open a pull request from `claude/fervent-planck-cvxgmf` into `main`, merge it, then set Railway's branch to `main`.

## 4. Run and test locally

Requirements: Python 3.12, Node 22, [uv](https://docs.astral.sh/uv/).

```bash
python3 frontend/start_preview.py
```

This installs what it needs, starts the API and the visual frontend, and opens the page (normally http://127.0.0.1:3011). It runs as a single local researcher with no sign-in; the NVIDIA key can be entered on the setup page. Or run exactly what Railway runs, with sign-in when the Supabase variables are set:

```bash
docker build -t hypothesim . && docker run -p 3000:3000 -v hypothesim-data:/data -e NVIDIA_API_KEY=... hypothesim
```

Checks (all must pass before pushing):

```bash
uv run pytest
```

```bash
npm run typecheck && npm run test:workspace --workspace apps/web && npm run contracts:check && npm run build
```

```bash
cd frontend && npm run build && npm run test:science && npm run test:ui && npm run test:models && npm run test:entry
```

With the preview running: `HYPOTHESIM_TEST_URL=http://127.0.0.1:3011 npm run test:visual` (also `test:hypothesis`, `test:research`, `test:glass`, `test:reveal`). After changing `apps/web` science components, run `node scripts/sync-science-local.cjs ..` from `frontend/` and rerun the checks.

After changing Python schemas, regenerate contracts with `uv run npm run contracts:generate`.

Live and browser tools (need the NVIDIA key and network access to `www.ebi.ac.uk`, `europepmc.org`, `integrate.api.nvidia.com`):

- `scripts/run_demo_candidate.py`: run a question live through the real agent and record a receipt.
- `scripts/check_demo_browser.mjs`: 10-step browser check of the demo path against the synthetic backend (`scripts/serve_investigation_ui_checks.py`).
- `scripts/profile_workspace.mjs`: slider and playback performance.

At last measurement: 447 backend tests, 66 frontend tests, a 10/10 browser check, and slider redraw at a 250 ms median.

## 5. Where we are in the plan

Done: Phases 0–4, 5A–5B, 7A–7E, 8A–8E, **5C.1** (integration, performance, live-verified demo questions), **5C.1b** (agent reliability), **5C.2** (accounts, sharing, community, one-container deployment, **live on Railway**).

| Next | What | Status |
| --- | --- | --- |
| 5C.2 sign-off | Owner confirms Google sign-in, research, share and second-account view on the live URL, and that the `/data` volume is attached | Waiting on owner check |
| **5C.3** | **Live agent-workflow screen.** On submit, a dedicated screen shows the agent loop as it happens: papers found and parsed, values extracted and accepted or rejected, the solver run, PDB data and the 3D viewer focusing on the measured contact. Every step must come from recorded execution events (`job.execution_events`, already streamed via polling), not an animation. Both demo questions must play through it. | Not started; awaits green light |
| 6A | Demo package: final saved demo, runbook, environment instructions | Not started |
| 6B | Two full rehearsals, one with literature access off; fix only acceptance failures | Not started |

Useful context for 5C.3: `apps/web/components/InvestigationPanel.tsx` and `apps/web/lib/investigation.ts` already turn execution events into stages and tool rows. `AgentTurn.research_papers` holds papers and extracted candidates, and `StructureViewer` accepts a focus request (see `focusMeasurement` in `HypothesisWorkspace.tsx`).

## 6. Demo (details in `docs/DEMO_EXAMPLES.md`)

1. **"Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"** Prefilled; about 1.5 min live; 8 of 10 live runs completed end to end. Answer: *mixed*, because both alternatives stay above 90%.
2. **Follow-up "Raise the occupancy threshold to 95%"** (one click on its card); about 25 s; 3 of 3. Punchline: tripled half-life stays above 95% while tenfold affinity drops below.
3. Fallback: **Load saved demo** (works even if the AI or literature service is down).

Honest talking points: the agent independently extracted clearance 0.127 L/day and volume 2.62 L, matching the audited inputs. For this question the curves use audited reference values; on other drugs the agent's own cited values feed the model, or it asks for what is missing. The general path takes about 3 minutes and usually ends at *needs inputs*.

**Demo mode (default on):** the trastuzumab question and the "Run this comparison for 120 days" follow-up replay recorded live agent runs (`data/demo/replay/`), so the judged path always works in about 25 s and 15 s. See `docs/DEMO_EXAMPLES.md`. Every other request runs the live agent.

## 7. Known issues and gotchas

- Live AI runs vary: extraction is sometimes rejected by the validators (by design), and the free NVIDIA endpoint can be slow. All model calls stream because non-streaming calls over about 30 s fail with 502.
- General (non-preset) research takes 160–185 s and often runs out of time before the written answer validates.
- Data is SQLite on the Railway volume. That is fine at hackathon scale; a managed database would be needed for multiple instances.
- Google OAuth in testing mode allows only listed test users; publish the app or add judges as test users.
- The repository's development rules (in `docs/IMPLEMENTATION_PLAN.md`, "Execution policy") ask for a review after every subphase, and a green light from the owner before starting the next.

## 8. For a new Claude session

Paste something like:

> Read `HANDOFF.md`, then `docs/IMPLEMENTATION_PLAN.md`. Work on branch `claude/fervent-planck-cvxgmf` (it auto-deploys to Railway). Next chunk: 5C.3 live agent-workflow screen. Follow the plan's review-and-green-light policy.

Cloud sessions need network access to the literature and NVIDIA hosts listed in section 4, plus an NVIDIA key, to run live checks.
