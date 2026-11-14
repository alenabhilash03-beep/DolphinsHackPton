"""Callable 7A assessment tool; broader experiment-agent wiring is 7C."""
from langchain_core.tools import tool
from app.research.drug_identity import DrugAssessmentService
from app.schemas.drug_support import DrugAssessmentRequest

def build_assessment_tool(service: DrugAssessmentService | None = None):
    assessment = service or DrugAssessmentService()

    @tool
    def assess_drug_model(request: DrugAssessmentRequest) -> dict:
        """Resolve an exact drug identity and assess reviewed model eligibility. Never runs a simulation or approves unreviewed database parameters. Natural-language intervention parsing is separate."""
        return assessment.assess(request).model_dump(mode="json")

    return assess_drug_model
