"""Deterministic preparation/configuration tools for the future generalized agent."""
from langchain_core.tools import tool
from app.research.preparation import PreparationService
from app.schemas.experiment_preparation import PreparationRequest
from app.schemas.preparation_workflow import CreatePreparation, PreparationUpdate, PreparationVersion
from app.schemas.contracts import SimulationRequest
from app.simulation.service import run_simulation


def build_preparation_tools(service: PreparationService | None = None):
    preparation = service or PreparationService()

    @tool
    def start_experiment_preparation(request: PreparationRequest) -> dict:
        """Resolve an arbitrary drug identity and start a persistent conditional preparation. Returns explicit missing inputs; does not research or simulate."""
        return preparation.create(CreatePreparation(request=request)).model_dump(mode='json')

    @tool
    def read_experiment_preparation(preparation_id: str) -> dict:
        """Read the current persisted evidence, missing questions, revision and hash for this preparation."""
        return preparation.store.read(preparation_id).model_dump(mode='json')

    @tool
    def update_experiment_preparation(preparation_id: str, update: PreparationUpdate) -> dict:
        """Submit retrieved document IDs, reported candidates, explicit researcher assumptions or outstanding clarification answers. Server revalidates applicability and preserves immutable history. Never invent missing measurements."""
        return preparation.revise(preparation_id,update).model_dump(mode='json')

    @tool
    def configure_prepared_experiment(preparation_id: str, version: PreparationVersion) -> dict:
        """Build a conditional structured baseline only after deterministic readiness checks. Preserves citations and assumptions; no solver call or natural-language intervention parsing."""
        return preparation.configure(preparation_id,version).model_dump(mode='json')

    @tool
    def simulate_prepared_experiment(request: SimulationRequest) -> dict:
        """Run the deterministic scientific solver on a server-registered conditional research configuration. Never generate numerical results yourself."""
        if request.experiment.mode!='research_derived':
            raise ValueError('Use this tool for registered prepared research configurations only')
        return run_simulation(request,preparation_store=preparation.store).model_dump(mode='json')

    return [start_experiment_preparation,read_experiment_preparation,update_experiment_preparation,
            configure_prepared_experiment,simulate_prepared_experiment]


def build_preparation_research_toolkit(service: PreparationService | None = None, *, extractor=None):
    """Compose tools with one shared snapshot session. Does not construct an agent loop."""
    from app.agent.evidence_tools import build_evidence_tools
    from app.research.parameter_extraction import ParameterResearchService
    preparation = service or PreparationService()
    evidence = ParameterResearchService(documents=preparation.documents, extractor=extractor)
    return [*build_evidence_tools(evidence), *build_preparation_tools(preparation)]
