# Required paper research and extraction repair

## Root causes

The previous IV-infusion timeout repair explicitly prioritized `prepare_reviewed_comparison` before research. That shortcut produced real numerical results but skipped the search/retrieval/extraction workflow required by the product specification. The visible “not run” stages accurately exposed that regression.

Restoring research uncovered two additional issues in live traces:

- Nemotron extraction requests exhausted all 4,096 output tokens on reasoning (`finish_reason: length`, no data tool call). These were previously indistinguishable from other invalid/unavailable extractor responses.
- Some proposals paraphrased source excerpts, converted reported units, or attached context not literally supported by the quoted passage. Existing scientific guards rejected them correctly, but the next extraction had no precise validation feedback.

## Repair

Research runs, including the exact reviewed demo question, must search for sources, retrieve actual source text and invoke cited extraction before the reviewed comparison is available. Server guards enforce this sequence; primary-comparison model tools are narrowed by actual workflow state. The primary branch cannot waste its research budget reconstructing an unrelated generic baseline or finish merely because that initial draft lists missing values. Its final-decision schema becomes available after actual execution or an observed research block. Generic research and parameter-only edit behavior remain distinct.

Audited paper titles and PMIDs are provided as citation leads for the reviewed comparison. Optional numeric-PMID searches remain live Europe PMC requests, constrained to the submitted drug. These leads are not substituted for source text or extracted measurements. Other drugs retain hypothesis-directed searches.

The extraction data call uses `chat_template_kwargs.enable_thinking=false`, supported by [NVIDIA’s model documentation](https://docs.nvidia.com/nim/large-language-models/2.0.13/get-started/advanced/get-started-nemotron-3.5-super-vl.html). The main agent keeps its reasoning mode. A truncated extraction remains unavailable, with a specific output-token-limit explanation; it is never treated as an empty successful extraction. Prompt instructions and field-specific feedback help recover exact quotes/context without weakening any source/number/unit checks.

An explicitly uncertain placeholder with both value and unit null is omitted without inventing a measurement; it no longer invalidates independent real measurements in the same batch. Every independent proposal is schema-validated strictly; a malformed proposal is recorded as rejected without discarding valid measurements in its batch. A wholly invalid batch is rejected, never mislabeled as a successful no-values extraction. These server-owned rejection diagnostics are private adapter metadata, absent from the LLM tool schema. Numeric matching now recognizes sentence-final punctuation without accepting prefixes of larger values. Explicit distribution clearance and peripheral-compartment volumes are rejected when mislabeled as elimination clearance or the effective model volume. EC50/IC50 passages cannot supply equilibrium affinity candidates. Stage labels count mixed actual outcomes rather than summarizing the whole stage with its last invocation.

`AgentTurn.research_papers` now persists actual inspected-source metadata, locators and extraction outcomes/candidates. The workspace displays these papers and cited passages immediately after the investigation. It distinguishes a fresh candidate from an independently audited simulation input. Empty, unavailable and rejected extraction outcomes have explicit text. Accepted reviewed comparison parameters are not silently replaced with unreviewed candidates.

The reviewed comparison requires an extraction attempt for every retrieved snapshot and at least one successful `candidates` or `no_values` outcome. A rejected/unavailable extraction receives one bounded correction attempt with explicit same-document feedback before a partial comparison is allowed. If a separate paper still fails, its actual failure remains visible, the configuration receipt marks research partial, and audited simulation inputs remain explicitly separate. If all extractions fail, the reviewed comparison is blocked. A source outage or wholly failed extraction cannot silently load demo curves. Parameter-only edits still do not call research tools; the explicit “Load saved demo” action remains available without claiming live research.

## Acceptance

Regression coverage includes attempted research bypass, workflow tool selection, durable paper/extraction records, valid no-values outcomes, rejected/unavailable extraction blocking, drug-constrained PMID validation, field-specific repair feedback and output-token exhaustion. **339 backend tests and 45 frontend tests pass**, together with TypeScript, contract checks and a production frontend build. Existing scientific validation and actual solver/result linkage remain authoritative. A live extraction on an explicitly cached, integrity-checked full-text snapshot returned clearance **0.127 L/day** and central volume **2.62 L** in **4.96 seconds**, with no rejected candidates; no unit conversion or half-life derivation was accepted. Fresh-search provider outages were also observed and returned honest unavailable outcomes.

A live exact-question run completed in **48.43 seconds** with remotely verified LangSmith tracing. Both papers were retrieved as full text; extraction yielded one validated candidate in one paper and rejected candidates in the other. The explicitly partial review was followed by audited comparison preparation, actual SciPy execution and interpretation. This is not a claim of a newly extracted complete drug-parameter package.

The final browser acceptance completed in **69.89 seconds** with remotely verified actual research, extraction, solver and interpretation tools. Full-text access was unavailable in that run, so both sources were explicitly labeled abstract-only; one extraction was rejected after its correction attempt and the other returned no-values. The simulation retained the separately audited inputs. An earlier live browser check retrieved full text and accepted **0.127 L/day** clearance and **2.62 L** central volume. The repair does not guarantee every paper yields valid measurements or make current source outages disappear.

Live verification results are recorded in `data/research/verification/required-paper-research-fix.json`. Local raw source snapshots and verification payloads stay ignored in `work/`.

## Plan decision

**Keep the research-first specification; correct the shortcut introduced by the preceding repair.** This is a repair of existing research/extraction behavior. The requested immediate plain-language AI synthesis is still the next planned work in **8B.1–8B.2**; current interpretation is deterministic solver-linked findings, not that richer AI summary. This repair does not claim those subphases are complete or add another supported drug/model.
