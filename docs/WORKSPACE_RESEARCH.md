# Generalized research workspace — 7D

Open `http://127.0.0.1:3002/preview/plots` with the local launcher running. The hypothesis form now uses the generalized Nemotron agent. It accepts arbitrary names; numerical execution still requires compatible evidence or explicit hypothetical inputs within the implemented model.

## Try the workflow

1. **Open saved demo** for the reviewed trastuzumab comparison without a live AI call. Play/scrub the common timeline and change the alternative's numerical controls. Plots, metrics and the binding schematic use the returned numerical result. The experimental structure stays fixed.
2. **Try imatinib research**, then **Research hypothesis**. Identity, paper retrieval, cited extraction and preparation run through actual agent tools. Activity reports factual tool requests, not invented progress percentages. Imatinib commonly needs more context/data; old curves remain explicitly labeled as the prior successful model.
3. Review **What is needed next**, **Extracted values, assumptions & source access**, source URLs/content kind/cache status, and the scientific checks. Candidate values are never labeled reviewed. An experimental structure does not make a model runnable.
4. Supply only assumptions you intend to test. Blank fields preserve candidates. An entered value explicitly replaces that field's selected input while retaining originals in history; linked KD/half-life are recalculated server-side. Supply scope, competition/exposure assumptions, a single administration event, duration and rationale. Confirm the structured baseline, then continue. Source availability cannot be solved by inventing measured values.
5. When a compatible result returns, the workspace loads its configuration, curves, metrics, common timeline and result-linked interpretation. A protected single baseline can become editable alternatives with **Compare twofold and fivefold affinity improvement at fixed association rate**. Try the documented quick-edit examples; ambiguous wording or extra instructions asks for clarification.
6. Direct sliders call the numerical API without an LLM. Subsequent language edits reference that exact stored result/hash/client revision. Earlier interpretation is marked stale after a direct edit. Parameter controls lock during agent work to avoid racing experimental bases; playback remains available.

The structured-baseline checkbox explicitly authorizes that first experiment; it does not authorize invented researcher assumptions or arbitrary biological models. Initial interventions outside supported parsing ask for clarification. Drug/target/route changes require new research. Explicit competition, irreversible/cooperative binding, oral/subcutaneous input and clinical efficacy remain unsupported.

## Missing data, identity and recovery

The continuation form exposes original candidate values/passages and their provenance, plus typed numerical fields in canonical units. Scientific values are blank by default. Molecular form/species/compartment/model regimes must be declared, not inferred from IV administration. New design initial conditions are explicitly zero free drug/occupancy with an analytical 0.9 threshold; existing conditions are preserved. Initial UI design supports one event; supported repeat infusion schedules can be created in an alternative through editing/controls.

An unknown/ambiguous/unavailable database identity is not silently resolved. An explicit hypothetical identity can be declared with molecular form, species, compartment and rationale first; numerical fields stay blank for this declaration. Then use the returned researcher identifier for explicit assumptions. An unsupported preparation displays its reasons and cannot continue to simulation. Starting a new compatible question remains available.

Background jobs survive page reloads through a saved job ID; the stored scientific request restores the form and structure context. Preparation IDs/versions are visible. **Resume a saved preparation** and **Reload preparation & latest version** recover state after a transient provider error or a stale update. Review the latest scientific state before retrying. A failed turn may already have persisted answers; do not repeatedly invent replacement values. Source outages are availability failures, not proof that literature does not exist.

Loading the saved demo invalidates pending browser responses; it does not cancel the provider's in-flight work. The local queue has two slots and returns 429 when full. UI submission/polling never waits on a long proxy request, and errors preserve the existing result. A page reload while research is pending may initially show the labeled reference curves until a completed agent result is restored.

## API and UI handoff

- `POST /api/agent/jobs/research` / `POST /api/agent/jobs/edits` → 202 `AgentJob`.
- `GET /api/agent/jobs/{id}` → persisted status, factual attempt events, original request context, preparation ID, final turn or sanitized failure.
- Existing synchronous 7C APIs, historical primary jobs and preparation APIs remain available.
- Next.js fixed-path proxies forward background calls and preparation reads; provider keys stay in FastAPI.
- Background execution is a bounded **single local process** queue. On restart, jobs whose owner process has exited become interrupted; schema export or a second app import cannot interrupt a live owner's job. This is not a distributed-worker deployment.
- Numerical HTTP results now register with the agent result store so natural-language edits can follow sliders. Research-derived receipts are still checked; registering a result grants no scientific review.

The UI retains preparation ID/revision/evidence hash and exact result/configuration hashes. A completed turn must match its interpretation IDs and client revision before replacing curves. Polling uses request epochs, so late results cannot overwrite a newer request or a saved demo. Controls and animation keep their existing deterministic headless controllers.

## Structures and evidence labeling

The verified cached complexes are trastuzumab–HER2 (1N8Z) and the related mouse c-Abl/imatinib reference (1IEP). The latter is labeled as mouse kinase-domain geometry, not human BCR-ABL intracellular kinetics. Matching requires the drug **and** target; other pairs show an honest unavailable state while supported mathematical preparation remains possible. No geometry depends on dose, affinity or playback.

Source summaries and plot recommendations now use the actual experiment. Generic candidates never borrow the reviewed trastuzumab cache, HER2-specific follow-ups or antibody-specific labels. Source summaries describe parameter lineage, not a fabricated summary of an inaccessible article. Guided camera tours/contact inspection are the next 7E chunk.

## Verification

Run `.venv/bin/python -m pytest`, `npm run test:workspace --workspace apps/web`, `npm run typecheck`, `npm run contracts:check` and `npm run build`. Queue tests cover capacity, progress, durable outcomes, interrupted-owner recovery, live-owner preservation, sanitized failures and numerical-result registration. Frontend tests cover stale-response epochs, result/interpretation linkage, fixed proxy paths and structure/target matching. The existing scientific, identity, unsupported-model and source-outage acceptance suites remain in force.

Live browser evidence and limitations are recorded in `docs/subphase-reviews/7D.md`. Numerical values used for software acceptance are explicitly synthetic assumptions and must not be described as recovered imatinib measurements or a new reviewed drug profile.
