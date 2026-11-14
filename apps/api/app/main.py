import asyncio
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import StreamingResponse

from app.config import Settings, ROOT
from app.agent.generalized import GeneralizedAgentService
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

    api = FastAPI(title="Hypothesim API", version="0.1.0", description="Evidence-aware research jobs and deterministic scientific simulation.", lifespan=lifespan)
    api.state.research_jobs = jobs
    api.state.preparations = preparations
    api.add_middleware(CORSMiddleware, allow_origins=config.hypothesim_cors_origins,
                       allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    generalized = GeneralizedAgentService(preparations, config)
    api.state.generalized_agent = generalized

    def agent_call(request, edit=False):
        try:
            return api.state.generalized_agent.run(request, edit=edit)
        except StalePreparation as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Unknown agent result/preparation") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Agent request or scientific tool validation failed") from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Generalized agent unavailable; no successful result is claimed. Read the preparation before retrying.") from exc

    @api.post("/api/agent/research", response_model=AgentTurn, tags=["Generalized agent"])
    def generalized_research(request: AgentResearchRequest):
        return agent_call(request)

    @api.post("/api/agent/edits", response_model=AgentTurn, tags=["Generalized agent"])
    def generalized_edit(request: AgentEditRequest):
        return agent_call(request, edit=True)

    @api.get("/api/agent/turns/{turn_id}", response_model=AgentTurn, tags=["Generalized agent"])
    def generalized_turn(turn_id: str):
        try: return api.state.generalized_agent.turns.read(turn_id)
        except KeyError as exc: raise HTTPException(status_code=404, detail="Unknown agent turn") from exc

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
    def validate_experiment(experiment: ExperimentConfig) -> ContractValidation:
        """Validate configuration structure and provenance, without running a simulation."""
        if experiment.mode == "research_derived":
            try:
                preparations.store.require_configuration(experiment)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        return ContractValidation(experiment_id=experiment.experiment_id, support_status=experiment.support.status,
                                  scenario_count=len(experiment.scenarios))

    @api.post("/api/simulations", response_model=SimulationResult)
    def simulate(request: SimulationRequest) -> SimulationResult:
        """Run the reviewed one-compartment model without an LLM call."""
        try:
            return run_simulation(request, preparation_store=preparations.store)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @api.post("/api/simulations/adjust", response_model=SimulationResult)
    def adjust_and_simulate(adjustment: ControlAdjustment) -> SimulationResult:
        """Apply one linked control edit and return the new deterministic result."""
        try:
            experiment = adjust_experiment(adjustment, preparation_store=preparations.store)
            return run_simulation(SimulationRequest(
                experiment=experiment,
                client_revision=adjustment.client_revision,
                output_points=adjustment.output_points,
            ), preparation_store=preparations.store)
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
    def create_preparation(request: CreatePreparation):
        """Resolve identity and report required structured inputs. No LLM, research search or solver call."""
        return preparation_call(preparations.create, request)

    @api.get("/api/preparations/{preparation_id}", response_model=PreparationRecord, tags=["Experiment preparation"])
    def read_preparation(preparation_id: str, revision: int | None = Query(default=None, ge=0)):
        return preparation_call(preparations.store.read, preparation_id, revision)

    @api.post("/api/preparations/{preparation_id}/revise", response_model=PreparationRecord, tags=["Experiment preparation"])
    def revise_preparation(preparation_id: str, update: PreparationUpdate):
        """Apply cited evidence or explicit researcher inputs, revalidate and persist consecutive revisions."""
        return preparation_call(preparations.revise, preparation_id, update)

    @api.post("/api/preparations/{preparation_id}/configure", response_model=ConfiguredPreparation, tags=["Experiment preparation"])
    def configure_preparation(preparation_id: str, version: PreparationVersion):
        """Configure one conditional structured baseline and store its receipt. Does not run the solver or parse a hypothesis."""
        return preparation_call(preparations.configure, preparation_id, version)

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
    def submit_research(request: HypothesisRequest) -> ResearchJob:
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
