# Phase 3B guarded research agent

`app.agent.workflow.run_research` is the callable 3B interface for the next research-job/API layer. It accepts a validated `HypothesisRequest`, a LangChain chat model, and optionally a Europe PMC client and settings. It returns a `ResearchOutcome` with a support assessment, parsed primary hypothesis, validated experiment, complete deterministic `SimulationResult`, result-linked `Interpretation`, retrieval status, actual tool calls, and trace information. Phase 3C will expose this workflow through asynchronous jobs and the visual hypothesis form.

The single LangChain `create_agent` uses a `ToolStrategy(AgentReport)` schema and three narrowly scoped tools:

| Tool | What it does |
| --- | --- |
| `read_reviewed_profile` | Reads the sole allowlisted intact trastuzumab–HER2 model, exact source IDs, parameter values, and conditional scope |
| `verify_primary_literature` | Looks up exact S2/S3 PMIDs through Europe PMC, validates IDs/title context, and labels a reviewed bibliographic-cache fallback during provider failure |
| `simulate_reviewed_comparison` | Passes the audited three-scenario experiment to the pure SciPy simulator and returns result-linked metrics to the model |

The current research agent deliberately supports the primary half-life ×3 versus affinity ×10 **IV-infusion** question. `scope_request` blocks unknown drugs, unsupported targets/routes/endpoints, conflicting dose/horizon overrides, and other interventions before an LLM can choose a model. The later custom-mode workflow can use the existing direct controls, but this agent never invents drug-specific parameters or silently changes the requested experiment. The registry remains the sole source of reviewed numerical inputs. Retrieved abstracts and titles are untrusted data and do not promote parameters to reviewed status.

After the agent finishes, `_verify_report` checks that all three tools ran, exact source verification succeeded or was clearly labeled cached/degraded, the structured response cites the required evidence IDs, and its experiment/result IDs match the actual solver output. A wrong PMID, DOI, or title context is rejected rather than treated as an ordinary provider outage. The final numerical claims are computed from `SimulationResult`, not from LLM arithmetic. Follow-up experiments come from an allowlisted set selected by the agent. The interpretation carries the exact result revision, assumptions, limitations, and threshold censoring. Slider edits do not invoke this workflow.

Run a live check against the user-selected, pinned NVIDIA endpoint:

```sh
.venv/bin/python scripts/run_research_agent.py --live
```

No paid OpenAI fallback is configured. The script prints a compact status, tool names, exact result ID, deterministic claims, and local trace status without printing credentials. For a **remote LangSmith** trace verification, set `LANGSMITH_API_KEY` and `LANGSMITH_TRACING=true` in the local `.env` and add `--require-tracing`. That mode reads the remote root trace back and verifies retrieval and simulation tool spans. Without those credentials, local LangChain run collection is checked but no remote LangSmith success is claimed.

Offline tests use a scripted LangChain model and a fake Europe PMC client to verify tool execution, outage fallback, unsupported requests, forged result rejection, and trace span names. These tests do not establish live model reliability; the dated live check is recorded in the 3B review.
