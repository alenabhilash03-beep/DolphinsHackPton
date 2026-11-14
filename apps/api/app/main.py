import asyncio
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import StreamingResponse

from app.config import Settings
from app.research.europe_pmc import EuropePMCClient, LiteratureSearch, RetrievalError
from app.research.registry import EvidenceProfile, load_evidence_profile
from app.research.jobs import ResearchCapacityError, ResearchEvent, ResearchJob, ResearchJobService
from app.research.demo import DemoSnapshot, load_demo
from app.research.drug_identity import DrugAssessmentService
from app.schemas.experiment_preparation import PREPARATION_CONTRACTS
from app.simulation.capabilities import ModelPreparationRequirements
from app.schemas.drug_support import DrugAssessmentRequest, DrugAssessmentResponse
from app.schemas.contracts import ALL_CONTRACTS, ControlAdjustment, ContractValidation, ExperimentConfig, HealthResponse, HypothesisRequest, SimulationRequest, SimulationResult
from app.simulation.controls import adjust_experiment
from app.simulation.service import run_simulation


def create_app(settings: Settings | None = None, literature_client: EuropePMCClient | None = None,
               job_service: ResearchJobService | None = None, assessment_service: DrugAssessmentService | None = None) -> FastAPI:
    config = settings or Settings()
    research = literature_client or EuropePMCClient()
    jobs = job_service or ResearchJobService(config)
    assessment = assessment_service or DrugAssessmentService()
    @asynccontextmanager
    async def lifespan(_api):
        yield
        await asyncio.to_thread(jobs.close)

    api = FastAPI(title="Hypothesim API", version="0.1.0", description="Evidence-aware research jobs and deterministic scientific simulation.", lifespan=lifespan)
    api.state.research_jobs = jobs
    api.add_middleware(CORSMiddleware, allow_origins=config.hypothesim_cors_origins,
                       allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

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
        return ContractValidation(experiment_id=experiment.experiment_id, support_status=experiment.support.status,
                                  scenario_count=len(experiment.scenarios))

    @api.post("/api/simulations", response_model=SimulationResult)
    def simulate(request: SimulationRequest) -> SimulationResult:
        """Run the reviewed one-compartment model without an LLM call."""
        try:
            return run_simulation(request)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @api.post("/api/simulations/adjust", response_model=SimulationResult)
    def adjust_and_simulate(adjustment: ControlAdjustment) -> SimulationResult:
        """Apply one linked control edit and return the new deterministic result."""
        try:
            experiment = adjust_experiment(adjustment)
            return run_simulation(SimulationRequest(
                experiment=experiment,
                client_revision=adjustment.client_revision,
                output_points=adjustment.output_points,
            ))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

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
        components["ResearchEvent"] = ResearchEvent.model_json_schema()
        api.openapi_schema = schema
        return schema

    api.openapi = openapi
    return api


app = create_app()
