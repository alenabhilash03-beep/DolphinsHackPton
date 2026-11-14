from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.config import Settings
from app.schemas.contracts import ALL_CONTRACTS, ControlAdjustment, ContractValidation, ExperimentConfig, HealthResponse, SimulationRequest, SimulationResult
from app.simulation.controls import adjust_experiment
from app.simulation.service import run_simulation


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    api = FastAPI(title="Hypothesim API", version="0.1.0", description="Deterministic scientific simulation API. Research-agent endpoints are not implemented yet.")
    api.add_middleware(CORSMiddleware, allow_origins=config.hypothesim_cors_origins,
                       allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @api.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            ai_credentials_configured=bool(config.nvidia_api_key and config.nvidia_api_key.get_secret_value()),
            tracing_credentials_configured=bool(config.langsmith_api_key and config.langsmith_api_key.get_secret_value()),
        )

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

    def openapi() -> dict:
        if api.openapi_schema:
            return api.openapi_schema
        schema = get_openapi(title=api.title, version=api.version, routes=api.routes, description=api.description)
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        # Publish shared schemas, including contracts reserved for future research endpoints.
        for model in ALL_CONTRACTS:
            item = model.model_json_schema(ref_template="#/components/schemas/{model}")
            components.update(item.pop("$defs", {}))
            components[model.__name__] = item
        api.openapi_schema = schema
        return schema

    api.openapi = openapi
    return api


app = create_app()
