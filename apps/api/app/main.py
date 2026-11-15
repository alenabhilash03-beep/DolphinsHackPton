import asyncio
import logging
from time import monotonic
from contextlib import asynccontextmanager

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import Response, StreamingResponse

from app.config import Settings, ROOT

log = logging.getLogger("hypothesim.api")
from app.agent.generalized import GeneralizedAgentService
from app.research.agent_jobs import AgentQueue, AgentJob
from app.schemas.generalized_agent import AgentResearchRequest, AgentEditRequest, AgentTurn
from app.research.preparation import PreparationService
from app.research.preparation_store import PreparationStore, StalePreparation
from app.schemas.preparation_workflow import (CreatePreparation, PreparationUpdate, PreparationRecord, PreparationVersion, ConfiguredPreparation, WORKFLOW_CONTRACTS)
from app.research.europe_pmc import EuropePMCClient, LiteratureSearch, RetrievalError
from app.research.registry import EvidenceProfile, load_evidence_profile
from app.research.jobs import ResearchCapacityError, ResearchEvent, ResearchJob, ResearchJobService
from app.research.reference_audits import ReferenceAudit, load_reference_audit
from app.research.demo import DemoSnapshot, load_demo
from app.research.drug_identity import DrugAssessmentService
from app.schemas.experiment_preparation import PREPARATION_CONTRACTS
from app.schemas.evidence_extraction import EVIDENCE_EXTRACTION_CONTRACTS
from app.simulation.capabilities import ModelPreparationRequirements
from app.schemas.drug_support import DrugAssessmentRequest, DrugAssessmentResponse
from app.schemas.contracts import ALL_CONTRACTS, ControlAdjustment, ContractValidation, ExperimentConfig, HealthResponse, HypothesisRequest, SimulationRequest, SimulationResult
from app.simulation.controls import adjust_experiment
from app.simulation.service import run_simulation
from app.schemas.structure_analysis import InterfaceContacts, ResidueDistance, ResidueSelector, StructureMetadata
from app.auth import AuthError, AuthUnavailable, Authenticator, User, supabase_lookup
from app.workspaces import Workspace, WorkspaceRegistry
from app.research.sharing import ShareStore, build_share, configured_summarizer
from app.schemas.sharing import SharedExperiment, ShareList, ShareRequest
from app.research.paper_reader import PaperArticle, PaperChatAnswer, PaperChatRequest, PaperReader, article_context, configured_paper_chat, render_pdf
from app.structures.service import StructureService, resolve as resolve_structure
from app.schemas.experiment_proposals import ProposalSet
from app.research.proposals import propose
from app.schemas.investigation import InvestigationHistory, StoredResult
from app.simulation.service import _canonical_hash


CONTROL_NAMES = {'dose_mg': ('Dose per infusion', ' mg'), 'dosing_interval_h': ('Dosing interval', ' h'), 'pk.volume_L': ('Volume', ' L'),
    'pk.clearance_L_h': ('Clearance', ' L/h'), 'pk.elimination_half_life_h': ('Half-life', ' h'),
    'binding.association_nM_inv_h_inv': ('Association rate', ' per nM per h'), 'binding.dissociation_h_inv': ('Dissociation rate', ' per h'),
    'binding.affinity_nM': ('Affinity (KD)', ' nM'), 'exposure_factor': ('Exposure factor', ''), 'duration_h': ('Observation window', ' h'),
    'occupancy_threshold': ('Occupancy threshold', '')}


def control_label(adjustment: ControlAdjustment) -> str:
    """A readable history title for one direct control edit, using the scenario's own label."""
    name, unit = CONTROL_NAMES[adjustment.field]
    scenario = next((item.label for item in adjustment.experiment.scenarios if item.scenario_id == adjustment.scenario_id), None)
    change = f'{name} set to {adjustment.value:g}{unit}' if adjustment.value is not None else f'{name} cleared'
    return (change + (f' in {scenario}' if scenario else ''))[:700]


def create_app(settings: Settings | None = None, literature_client: EuropePMCClient | None = None,
               job_service: ResearchJobService | None = None, assessment_service: DrugAssessmentService | None = None, preparation_service: PreparationService | None = None) -> FastAPI:
    config = settings or Settings()
    research = literature_client or EuropePMCClient()
    jobs = job_service or ResearchJobService(config)
    assessment = assessment_service or DrugAssessmentService()
    preparations = preparation_service or PreparationService(store=PreparationStore(config.preparation_db_path or ROOT / "work/preparations.sqlite3"), assessment=assessment)
    @asynccontextmanager
    async def lifespan(_api):
        yield
        await asyncio.to_thread(jobs.close)
        agent_queue.close()
        registry.close()

    api = FastAPI(title="Hypothesim API", version="0.1.0", description="Evidence-aware research jobs and deterministic scientific simulation.", lifespan=lifespan)
    api.state.research_jobs = jobs
    api.state.preparations = preparations
    api.add_middleware(CORSMiddleware, allow_origins=config.hypothesim_cors_origins,
                       allow_credentials=False, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type", "Authorization"])

    generalized = GeneralizedAgentService(preparations, config)
    api.state.generalized_agent = generalized
    agent_queue = AgentQueue(generalized)

    # --- Accounts and per-user workspaces (5C.2) ---
    supabase_key = config.supabase_publishable_key or config.supabase_anon_key
    authenticator = Authenticator(config.auth_mode, supabase_lookup(config.supabase_url, supabase_key)
        if config.auth_mode == 'supabase' and config.supabase_url and supabase_key else None)
    workspaces_dir = config.workspaces_dir or ROOT / 'work/workspaces'
    def user_workspace(directory):
        prep = PreparationService(store=PreparationStore(directory / 'preparations.sqlite3'), assessment=assessment)
        agent = GeneralizedAgentService(prep, config)
        return Workspace(preparations=prep, agent=agent, queue=AgentQueue(agent, slots=registry.slots))
    registry = WorkspaceRegistry(lambda: Workspace(preparations=preparations, agent=api.state.generalized_agent, queue=agent_queue),
        workspaces_dir, user_workspace, config.agent_max_concurrent)
    shares = ShareStore(workspaces_dir / 'community.sqlite3')
    api.state.authenticator = authenticator
    api.state.workspaces = registry
    api.state.shares = shares
    api.state.share_summarizer = None  # tests inject a scripted summarizer; production builds one per request

    def viewer(authorization: str | None = Header(default=None)) -> User | None:
        try: return api.state.authenticator.user(authorization)
        except AuthError as exc: raise HTTPException(status_code=401, detail="Sign-in expired or invalid; sign in again.") from exc
        except AuthUnavailable as exc: raise HTTPException(status_code=503, detail="Sign-in service unavailable; retry shortly.") from exc

    def signed_in(user: User | None = Depends(viewer)) -> User:
        if user is None: raise HTTPException(status_code=401, detail="Sign in to use the research agent and your experiments.")
        return user

    def workspace(user: User | None = Depends(viewer)) -> Workspace:
        return registry.for_user(user)

    def own_workspace(user: User = Depends(signed_in)) -> Workspace:
        return registry.for_user(user)

    def agent_call(agent, request, edit=False):
        try:
            return agent.run(request, edit=edit)
        except StalePreparation as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Unknown agent result/preparation") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Agent request or scientific tool validation failed") from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Generalized agent unavailable; no successful result is claimed. Read the preparation before retrying.") from exc

    @api.post("/api/agent/jobs/research", response_model=AgentJob, status_code=202, tags=["Generalized agent"])
    def queue_agent_research(request: AgentResearchRequest, ws: Workspace = Depends(own_workspace)):
        try: return ws.queue.submit(request)
        except RuntimeError as exc: raise HTTPException(status_code=429, detail="Local research slots are busy; retry shortly.") from exc

    @api.post("/api/agent/jobs/edits", response_model=AgentJob, status_code=202, tags=["Generalized agent"])
    def queue_agent_edit(request: AgentEditRequest, ws: Workspace = Depends(own_workspace)):
        try: return ws.queue.submit(request, edit=True)
        except RuntimeError as exc: raise HTTPException(status_code=429, detail="Local research slots are busy; retry shortly.") from exc

    @api.get("/api/agent/jobs/{job_id}", response_model=AgentJob, tags=["Generalized agent"])
    def read_agent_job(job_id: str, ws: Workspace = Depends(own_workspace)):
        try: return ws.queue.read(job_id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Unknown agent job") from exc

    @api.post("/api/agent/research", response_model=AgentTurn, tags=["Generalized agent"])
    def generalized_research(request: AgentResearchRequest, ws: Workspace = Depends(own_workspace)):
        return agent_call(ws.agent, request)

    @api.post("/api/agent/edits", response_model=AgentTurn, tags=["Generalized agent"])
    def generalized_edit(request: AgentEditRequest, ws: Workspace = Depends(own_workspace)):
        return agent_call(ws.agent, request, edit=True)

    @api.get("/api/agent/results/{result_id}/proposals", response_model=ProposalSet, tags=["Generalized agent"])
    def result_proposals(result_id: str, ws: Workspace = Depends(workspace)) -> ProposalSet:  # deterministic; running one needs sign-in
        """Follow-up experiments derived from the solver facts of one stored result. No LLM call."""
        try: result, child = ws.agent.turns.result(result_id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Unknown result") from exc
        if child:
            return ProposalSet(base_result_id=result_id, status="superseded", proposals=propose(result),
                note="A newer experiment was already run from this result. Running one of these starts a new branch; nothing is overwritten.")
        return ProposalSet(base_result_id=result_id, status="available", proposals=propose(result))

    @api.get("/api/agent/results/{result_id}", response_model=StoredResult, tags=["Generalized agent"])
    def stored_result(result_id: str, ws: Workspace = Depends(own_workspace)) -> StoredResult:
        """Reopen a stored result exactly as it was computed. No recalculation and no LLM call."""
        turns = ws.agent.turns
        try: result, _ = turns.result(result_id); meta = turns.meta(result_id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Unknown result") from exc
        return StoredResult(result=result, turn_id=meta["turn_id"], origin=meta["origin"] or "direct_simulation",
            parent_result_id=meta["parent"], child_count=meta["child_count"])

    @api.get("/api/agent/investigations/{result_id}", response_model=InvestigationHistory, tags=["Generalized agent"])
    def investigation_history(result_id: str, ws: Workspace = Depends(own_workspace)) -> InvestigationHistory:
        """The tree of results this one belongs to, with bounded summaries and no time series."""
        try: return ws.agent.turns.history(result_id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Unknown result") from exc

    @api.get("/api/agent/turns/{turn_id}", response_model=AgentTurn, tags=["Generalized agent"])
    def generalized_turn(turn_id: str, ws: Workspace = Depends(own_workspace)):
        try: return ws.agent.turns.read(turn_id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Unknown agent turn") from exc

    structures = StructureService()

    @api.get("/api/structures", response_model=StructureMetadata, tags=["Structure analysis"])
    def find_structure(drug: str = Query(max_length=200), target: str = Query(max_length=200)) -> StructureMetadata:
        """Verified cached structure for a drug/target pair, or an explicit unavailable outcome. No LLM call."""
        pdb_id = resolve_structure(drug, target)
        if pdb_id is None:
            return StructureMetadata(status="unavailable", reason="unknown_structure",
                detail="No verified cached drug–target structure exists for this pair.")
        return structures.metadata(pdb_id)

    @api.get("/api/structures/{pdb_id}/interface", response_model=InterfaceContacts, tags=["Structure analysis"])
    def structure_interface(pdb_id: str, limit: int = Query(default=20, ge=1, le=100)) -> InterfaceContacts:
        """Closest drug–target residue pairs within 4 Å in deposited coordinates. Geometry only."""
        return structures.interface(pdb_id, limit)

    @api.post("/api/structures/{pdb_id}/distance", response_model=ResidueDistance, tags=["Structure analysis"])
    def structure_distance(pdb_id: str, residue: ResidueSelector = Body(embed=True), counterpart: ResidueSelector | None = Body(default=None, embed=True),
                           limit: int = Body(default=5, ge=1, le=20, embed=True)) -> ResidueDistance:
        """Minimum heavy-atom distance for one residue against a named or its nearest binding-partner residues."""
        return structures.distance(pdb_id, residue, counterpart, limit)

    @api.post("/api/shares", response_model=SharedExperiment, status_code=201, tags=["Community"])
    def share_experiment(request: ShareRequest, user: User = Depends(signed_in)) -> SharedExperiment:
        """Publish an immutable snapshot of your investigation, with a log summary and a grounded AI summary."""
        ws = registry.for_user(user)
        summarizer = api.state.share_summarizer
        if summarizer is None:
            try: summarizer = configured_summarizer(config)
            except Exception: summarizer = None
        try: share = build_share(request, user, ws.agent, summarizer)
        except (KeyError, StopIteration) as exc: raise HTTPException(status_code=404, detail="That result is not in your investigations.") from exc
        shares.save(share, user.id)
        return share.model_copy(update={'is_owner': True})

    @api.get("/api/shares", response_model=ShareList, tags=["Community"])
    def community_feed(user: User = Depends(signed_in)) -> ShareList:
        return shares.list(user.id)

    @api.get("/api/shares/{share_id}", response_model=SharedExperiment, tags=["Community"])
    def shared_experiment(share_id: str, user: User = Depends(signed_in)) -> SharedExperiment:
        try: return shares.read(share_id, user.id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Shared experiment not found") from exc

    @api.delete("/api/shares/{share_id}", status_code=204, tags=["Community"])
    def unshare_experiment(share_id: str, user: User = Depends(signed_in)):
        try: shares.delete(share_id, user.id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Shared experiment not found") from exc
        except PermissionError as exc: raise HTTPException(status_code=403, detail=str(exc)) from exc

    # --- Delve deeper: one open-access article as a PDF, with a chat grounded in its text ---
    papers = PaperReader(workspaces_dir.parent / 'papers', literature=research)
    api.state.paper_reader = papers
    api.state.paper_chat = None  # tests inject a scripted responder; production builds one per request
    pdf_cache: dict[str, bytes] = {}

    def read_paper(key: str) -> PaperArticle:
        try: return api.state.paper_reader.article(key)
        except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc: raise HTTPException(status_code=503, detail="Europe PMC did not return this article in time. Please retry.") from exc

    @api.get("/api/papers/{paper_key}", response_model=PaperArticle, tags=["Paper reader"])
    def paper_article(paper_key: str) -> PaperArticle:
        """The open-access text of one article (PMCID or PMID), as ordered sections."""
        return read_paper(paper_key)

    @api.get("/api/papers/{paper_key}/pdf", tags=["Paper reader"], response_class=Response,
             responses={200: {"content": {"application/pdf": {}}, "description": "A readable PDF of the open-access text"}})
    def paper_pdf(paper_key: str) -> Response:
        """A readable PDF rendered from the article's open-access text (Europe PMC does not permit framing its own PDFs)."""
        article = read_paper(paper_key)
        if article.key not in pdf_cache:
            if len(pdf_cache) > 32: pdf_cache.clear()
            pdf_cache[article.key] = render_pdf(article)
        return Response(pdf_cache[article.key], media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{article.key}.pdf"', "Cache-Control": "private, max-age=3600"})

    # Reading and asking about one open-access paper needs no account (the reader is public); a shared cap on
    # signed-out questions protects the provider key. Signed-in researchers are not capped.
    chat_window: list[float] = []
    ANON_CHAT_LIMIT, ANON_CHAT_WINDOW_S = 60, 600

    @api.post("/api/papers/{paper_key}/chat", response_model=PaperChatAnswer, tags=["Paper reader"])
    def paper_chat(paper_key: str, request: PaperChatRequest, user: User | None = Depends(viewer)) -> PaperChatAnswer:
        """Answer a question about one article with Nemotron, grounded only in that article's text."""
        if request.messages[-1].role != "user":
            raise HTTPException(status_code=422, detail="The last message must be the user's question.")
        if user is None:
            now = monotonic()
            chat_window[:] = [t for t in chat_window if now - t < ANON_CHAT_WINDOW_S]
            if len(chat_window) >= ANON_CHAT_LIMIT:
                raise HTTPException(status_code=429, detail="Many people are asking questions right now. Sign in with Google, or try again in a few minutes.")
            chat_window.append(now)
        article = read_paper(paper_key)
        responder = api.state.paper_chat
        if responder is None:
            try: responder = configured_paper_chat(config)
            except RuntimeError as exc: raise HTTPException(status_code=503, detail="The NVIDIA key is not configured on this server.") from exc
        try: answer = responder(article, request.messages)
        except Exception as exc:
            log.exception("paper chat failed for %s", article.key)
            # Error class and provider status only (never provider text, which can echo request details).
            status = getattr(getattr(exc, 'response', None), 'status_code', None) or getattr(exc, 'status_code', None)
            code = type(exc).__name__ + (f" {status}" if status else "")
            raise HTTPException(status_code=503, detail=f"Nemotron could not answer just now ({code}). Please ask again.") from exc
        return PaperChatAnswer(answer=answer, content_kind=article.content_kind, context_truncated=article_context(article)[1])

    @api.get("/api/auth/me", tags=["Community"])
    def who_am_i(user: User | None = Depends(viewer)) -> dict:
        return {'signed_in': user is not None, 'auth_mode': config.auth_mode, 'id': user.id if user else None,
                'name': user.name if user else None, 'avatar_url': user.avatar_url if user else None}

    @api.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            ai_credentials_configured=bool(config.nvidia_api_key and config.nvidia_api_key.get_secret_value()),
            tracing_credentials_configured=bool(config.langsmith_api_key and config.langsmith_api_key.get_secret_value()),
        )

    @api.get("/api/demo", response_model=DemoSnapshot)
    def saved_demo() -> DemoSnapshot:
        """Load a labeled saved result without contacting an LLM or literature provider."""
        try:
            return load_demo()
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=503, detail="Saved demo unavailable; regenerate it with scripts/prepare_demo.py") from exc

    @api.post("/api/contracts/experiments/validate", response_model=ContractValidation)
    def validate_experiment(experiment: ExperimentConfig, ws: Workspace = Depends(workspace)) -> ContractValidation:
        """Validate configuration structure and provenance, without running a simulation."""
        if experiment.mode == "research_derived":
            try:
                ws.preparations.store.require_configuration(experiment)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        return ContractValidation(experiment_id=experiment.experiment_id, support_status=experiment.support.status,
                                  scenario_count=len(experiment.scenarios))

    @api.post("/api/simulations", response_model=SimulationResult)
    def simulate(request: SimulationRequest, ws: Workspace = Depends(workspace)) -> SimulationResult:
        """Run the reviewed one-compartment model without an LLM call."""
        try:
            result = run_simulation(request, preparation_store=ws.preparations.store)
            ws.agent.turns.seed(result)
            return result
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @api.post("/api/simulations/adjust", response_model=SimulationResult)
    def adjust_and_simulate(adjustment: ControlAdjustment, ws: Workspace = Depends(workspace)) -> SimulationResult:
        """Apply one linked control edit and return the new deterministic result."""
        try:
            experiment = adjust_experiment(adjustment, preparation_store=ws.preparations.store)
            result = run_simulation(SimulationRequest(
                experiment=experiment,
                client_revision=adjustment.client_revision,
                output_points=adjustment.output_points,
            ), preparation_store=ws.preparations.store)
            # History: this result follows the stored result whose configuration was edited.
            ws.agent.turns.seed(result, origin='direct_control', parent_configuration_sha256=_canonical_hash(adjustment.experiment.model_dump(mode="json")),
                label=control_label(adjustment))
            return result
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    def preparation_call(function, *args):
        try:
            return function(*args)
        except StalePreparation as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Preparation not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @api.post("/api/preparations", response_model=PreparationRecord, tags=["Experiment preparation"], status_code=201)
    def create_preparation(request: CreatePreparation, ws: Workspace = Depends(own_workspace)):
        """Resolve identity and report required structured inputs. No LLM, research search or solver call."""
        return preparation_call(ws.preparations.create, request)

    @api.get("/api/preparations/{preparation_id}", response_model=PreparationRecord, tags=["Experiment preparation"])
    def read_preparation(preparation_id: str, revision: int | None = Query(default=None, ge=0), ws: Workspace = Depends(own_workspace)):
        return preparation_call(ws.preparations.store.read, preparation_id, revision)

    @api.post("/api/preparations/{preparation_id}/revise", response_model=PreparationRecord, tags=["Experiment preparation"])
    def revise_preparation(preparation_id: str, update: PreparationUpdate, ws: Workspace = Depends(own_workspace)):
        """Apply cited evidence or explicit researcher inputs, revalidate and persist consecutive revisions."""
        return preparation_call(ws.preparations.revise, preparation_id, update)

    @api.post("/api/preparations/{preparation_id}/configure", response_model=ConfiguredPreparation, tags=["Experiment preparation"])
    def configure_preparation(preparation_id: str, version: PreparationVersion, ws: Workspace = Depends(own_workspace)):
        """Configure one conditional structured baseline and store its receipt. Does not run the solver or parse a hypothesis."""
        return preparation_call(ws.preparations.configure, preparation_id, version)

    @api.get("/api/research/audits/{drug}", response_model=ReferenceAudit, tags=["Drug evidence audits"])
    def reference_audit(drug: str):
        """Read audited evidence gaps and verified structure metadata; never grants simulation eligibility."""
        try:
            return load_reference_audit(drug)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="No audit for this name; independent research/preparation remains available") from exc
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=503, detail="Reference audit or its verified structure is unavailable") from exc

    @api.get("/api/research/evidence/trastuzumab", response_model=EvidenceProfile)
    def curated_trastuzumab_evidence() -> EvidenceProfile:
        """Return the audited preset and labeled bibliographic cache; no live claim."""
        return load_evidence_profile()

    @api.get("/api/research/search", response_model=LiteratureSearch)
    def search_literature(q: str = Query(min_length=1, max_length=500), limit: int = Query(default=5, ge=1, le=10)) -> LiteratureSearch:
        """Search current Europe PMC records; candidate metadata cannot become reviewed inputs."""
        try:
            return research.search(q, page_size=limit)
        except RetrievalError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

    @api.post("/api/research/jobs", response_model=ResearchJob, status_code=202)
    def submit_research(request: HypothesisRequest, _user: User = Depends(signed_in)) -> ResearchJob:
        """Queue one guarded hypothesis; parameter controls never use this endpoint."""
        try:
            return jobs.submit(request)
        except ResearchCapacityError as exc:
            raise HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": "3"}) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @api.post("/api/research/assess", response_model=DrugAssessmentResponse, tags=["Drug support"])
    def assess_drug(request: DrugAssessmentRequest = Body(openapi_examples={
        "reviewed": {"summary":"Reviewed antibody identity", "value":{"drug_name":"Herceptin","target":"HER2","route":"iv_infusion","endpoint":"target_occupancy"}},
        "candidate": {"summary":"Identified drug without a reviewed model", "value":{"drug_name":"imatinib","target":"Abl"}},
        "ambiguous": {"summary":"Brand with multiple molecular forms", "value":{"drug_name":"Gleevec"}},
        "unsupported_route": {"summary":"Reviewed identity, unsupported route", "value":{"drug_name":"trastuzumab","route":"oral"}},
    })) -> DrugAssessmentResponse:
        """Assess structured drug/model eligibility without running an LLM or simulator."""
        return assessment.assess(request)

    @api.get("/api/research/jobs/{job_id}", response_model=ResearchJob)
    def read_research(job_id: str) -> ResearchJob:
        job = jobs.store.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Research job not found")
        return job

    @api.get("/api/research/jobs/{job_id}/events")
    async def research_events(job_id: str, last_event_id: str | None = Header(default=None)) -> StreamingResponse:
        """Replay persisted events, then stream new factual progress with reconnection IDs."""
        if jobs.store.get(job_id) is None:
            raise HTTPException(status_code=404, detail="Research job not found")
        try:
            cursor = max(0, int(last_event_id or "0"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid Last-Event-ID") from exc

        async def stream():
            nonlocal cursor
            idle = 0
            while True:
                events = await asyncio.to_thread(jobs.store.events, job_id, cursor)
                for event in events:
                    cursor = event.event_id
                    yield f"id: {event.event_id}\nevent: progress\ndata: {event.model_dump_json()}\n\n"
                job = await asyncio.to_thread(jobs.store.get, job_id)
                if job and job.status in {"completed", "unsupported", "failed"}:
                    break
                idle += 1
                if idle % 30 == 0:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(0.5)

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})

    def openapi() -> dict:
        if api.openapi_schema:
            return api.openapi_schema
        schema = get_openapi(title=api.title, version=api.version, routes=api.routes, description=api.description)
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        # Publish shared schemas, including contracts reserved for future research endpoints.
        for model in [*ALL_CONTRACTS, *PREPARATION_CONTRACTS, ModelPreparationRequirements]:
            item = model.model_json_schema(ref_template="#/components/schemas/{model}")
            components.update(item.pop("$defs", {}))
            components[model.__name__] = item
        # New source-result contracts reuse published components without replacing the
        # serialization schemas of existing literature endpoints with input schemas.
        for model in [*WORKFLOW_CONTRACTS, *EVIDENCE_EXTRACTION_CONTRACTS]:
            item = model.model_json_schema(ref_template="#/components/schemas/{model}")
            for name, definition in item.pop("$defs", {}).items():
                components.setdefault(name, definition)
            components.setdefault(model.__name__, item)
        components["ResearchEvent"] = ResearchEvent.model_json_schema()
        api.openapi_schema = schema
        return schema

    api.openapi = openapi
    return api


app = create_app()
