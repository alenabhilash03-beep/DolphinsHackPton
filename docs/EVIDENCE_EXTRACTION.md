# Agent-callable evidence retrieval and parameter extraction — 7B.2

Status: services and three real LangChain tools implemented. They are callable now; orchestration by the generalized Nemotron agent remains 7C, [deterministic model applicability/configuration](PREPARATION_WORKFLOW.md) is implemented in 7B.3, and UI integration is 7D. The existing primary agent/workspace is unchanged. 7B.2 adds no execution route; the 7B.3 runtime now provides the separate preparation API. No additional reviewed drug profile is claimed.

## Agent tool interfaces

Instantiate `ParameterResearchService` once per preparation/agent run, then call `build_evidence_tools(service)` from `app/agent/evidence_tools.py`. Do not share a session between unrelated users or hypotheses.

| Tool | Input | Output |
| --- | --- | --- |
| `search_hypothesis_evidence` | 7B.1 `PreparationRequest`, focus `binding`, `pk` or `exposure` | Live Europe PMC metadata, source handles and status; never parameter approval |
| `retrieve_evidence_source` | A source handle from that session; optional `start_block` (default 0) | A bounded source snapshot with source identity, timestamp, hash, warnings and text locators; `next_start_block` to read more |
| `extract_cited_parameters` | Retrieved document ID, original request, proposed drug/target identifiers, optionally 1–12 selected locators | Candidate parameter records, source passages, missing fields, competing values, rejected candidates and explicit non-runnable status |

The future agent chooses searches, sources and pages, calls extraction, evaluates missing information through applicability tools, configures the experiment, calls the solver and explains the returned results. The extractor is a structured-output call to the configured NVIDIA Nemotron model inside a tool, not a replacement research agent or numerical calculator. An injectable extractor enables offline tests. No paid-provider fallback or local model download is used.

## Search and retrieval

Searches use quoted literal drug/target terms plus a bounded research focus. The hypothesis is retained for extraction; the agent chooses the focus according to its interpretation. Target is included in binding queries but is not required in PK queries. Each search returns at most five records, and a session permits four searches and at most twenty registered sources/documents. Search results remain bibliographic candidates, not measurements. Empty results and provider failure are distinct.

The connector reuses the existing Europe PMC core search client. Full text is requested only at the fixed official `/rest/{PMCID}/fullTextXML` endpoint; no arbitrary result URLs, redirects or document instructions are followed. Returned PMCID must match; PMID/DOI must agree when present in both metadata sources. Mismatched identities fail closed without abstract substitution. Standard external JATS declarations are inert under ElementTree; internal DTD subsets and entity definitions are rejected.

Full-text payloads are limited to 2 MB with a seven-second request timeout. Source snapshots contain at most 32 segments and 24,000 text characters. Pages cover up to twelve source blocks, prioritizing table rows while retaining stable block locators. Rows, including tables stored in a JATS floating-content group, include available caption, headers and footnotes as normalized text. This helps preserve table meaning but is not proof that a number belongs to a particular parameter/construct. A paragraph too large for one bounded snapshot can be truncated; warnings remain explicit. Page cursors progress through blocks, not through the omitted portion of an oversized single block. The service can reject further reads when its session limit is reached.

When full text is unavailable or unusable, the first page may return the actual retrieved abstract with `content_kind:abstract` and a warning. A later full-text page never silently becomes an abstract. If neither content is accessible, return unavailable. Absence of access is not absence of scientific evidence. No source titles, whole missing papers or search snippets are promoted into numerical evidence.

Each retrieved page has a distinct source ID so later configuration can reference the correct snapshot. The snapshot checksum covers the normalized source metadata, source segments, document ID and warnings (excluding the checksum and original-digest-reference fields themselves). It is not a checksum of the raw XML. Optional persistence writes under ignored `work/evidence-snapshots/`. Session lookups verify snapshot integrity and return deep copies. Explicit `restore(document_id)` validates safe filenames, payload size, schema, document ID and checksum, retains original retrieval time and marks the replay `cached`. Replay also retains the verified original digest reference for 7B.3 source-version checks. There is no automatic cache-as-live fallback. Hashes detect corruption; they do not establish source truth or protect against a malicious trusted filesystem writer.

## Structured extraction and deterministic checks

`LangChainParameterExtractor` uses the installed model's `with_structured_output(ExtractionProposalBatch)`. The system prompt treats both hypothesis and source content as data, asks for explicitly reported values, disallows invented conversions/rates, and requests unknown context as null. This extraction invocation has no tools, code execution or credential-reading capability. It can inherit the future agent's LangSmith tracing context; full agent trace acceptance remains 7C.

Before extraction, recognized instruction-bearing segments are excluded and reported. This heuristic is not a complete prompt-injection detector. The core execution boundary is that extraction can only produce unapproved candidates, never configure a model or call the simulator.

Every proposed candidate must:

- Name one of the implemented preparation model's known parameter fields.
- Quote an exact short passage from a locator actually sent to the extractor.
- Retain a numeric value and case-sensitive unit present in that passage. Common decimal, exponent and scientific-product forms are recognized; unsupported/ambiguous typography can be rejected rather than guessed.
- Preserve exact source substrings for any proposed species, molecular form, route, formulation, exposure compartment, assay conditions and source identity mentions. Unknowns stay unknown.
- Avoid bound/range/uncertain relations as scalar inputs. Explicit inequalities/range wording are rejected even if the model labels them exact.

Accepted records are always `reported` and `candidate`. They keep original units and values; no conversions or parameter derivations run here. Source IDs and passage links are assigned by the service, not invented by the model. Drug/target identifiers passed into the tool remain proposed associations pending 7B.3 identity/applicability checks. A source-matched number may still represent the wrong construct, assay, biological compartment or parameter: **traceability checks do not establish scientific compatibility**. IC50 must not be silently treated as KD; final applicability checks must enforce parameter meaning and relevant competition/exposure assumptions.

Competing values/units/contexts are preserved across extraction calls within a session and returned as conflict groups without averaging or automatic selection. Missing fields mean no traceable candidate exists in that session/scope; this is not a statement that all other fields are suitable for simulation. Structured-provider failures or invalid schemas return sanitized unavailable outcomes, never partial invented evidence. A session permits six extraction invocations; the NVIDIA call uses a 45-second request timeout and bounded output tokens. Future agent integration must also retain the existing parent research-job deadline.

LLM notes are explicitly marked unverified and kept separate from source-backed parameters. Later agent prompts must treat all tool-returned content as data. Neither source text nor notes may become execution instructions.

## Tests and live checks

`test_parameter_extraction.py` tests positive source-grounded extraction, exact citations, units, context, competing assays, missing measurements, source/LLM outages, corrupt cache, identity mismatch, bounded pages, invalid locators, prompt injection, provenance-promotion attempts and invocation through real LangChain tools. Checked-in article fixtures are synthetic; they contain no actual scientific evidence. Live snapshots remain ignored runtime files.

```sh
.venv/bin/python -m pytest apps/api/tests/test_parameter_extraction.py
# Real public search/retrieval only:
.venv/bin/python scripts/check_evidence_extraction.py --live
# Also use the configured free NVIDIA structured extractor:
.venv/bin/python scripts/check_evidence_extraction.py --live --live-llm
# Inspect the existing primary reference and a bounded later page:
.venv/bin/python scripts/check_evidence_extraction.py --live --live-llm --pmid 27043557 --start-block 12
```

The optional PMID flag performs an exact checked metadata lookup for the CLI reference test; it is not a tool that accepts arbitrary URLs. A successful no-values outcome verifies honest missing-data behavior, not successful recovery of a complete parameter package. No check calls the solver.

Public schemas are exported in OpenAPI components and frontend aliases in `apps/web/lib/contracts.ts`. The structured proposal schema is internal to the extractor. Cross-field/provenance and applicability checks remain server-side responsibilities.

API reference: [Europe PMC REST service](https://europepmc.org/RestfulWebService) and the official [Europe PMC tools example for fullTextXML](https://github.com/EuropePMC/epmc-tools/blob/main/docs/cli_usage.rst).

7B.3 deterministic preparation/configuration is complete. Next is **7B.4 — real reference audit and experimental structures**, before the generalized agent and UI integration.
