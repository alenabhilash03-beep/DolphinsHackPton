"""Agent-callable 7B.2 tools. Generalized agent orchestration is the separate 7C chunk."""
from typing import Literal
from langchain_core.tools import tool
from app.research.parameter_extraction import ParameterResearchService
from app.schemas.experiment_preparation import PreparationRequest


def build_evidence_tools(service: ParameterResearchService | None = None):
    session = service or ParameterResearchService()

    @tool
    def search_hypothesis_evidence(request: PreparationRequest, focus: Literal['binding','pk','exposure'] = 'binding', pmid: str | None = None) -> dict:
        """Search Europe PMC for this drug/hypothesis. Optionally look up an exact numeric PMID from a cited reference lead, still constrained to the submitted drug. Returns source handles; metadata is not numerical evidence."""
        return session.search(request, focus, pmid=pmid).model_dump(mode='json')

    @tool
    def retrieve_evidence_source(source_handle: str, start_block: int = 0) -> dict:
        """Retrieve one source handle returned by search in this session. Returns bounded full-text or explicitly labeled abstract segments and their locators. Follow next_start_block to read another bounded page. Tables are prioritized; locators remain source-grounded. No arbitrary URLs."""
        return session.documents.retrieve(source_handle, start_block).model_dump(mode='json')

    @tool
    def extract_cited_parameters(document_id: str, request: PreparationRequest, drug_identifier: str,
                                 target_identifier: str | None = None, locators: list[str] | None = None) -> dict:
        """Extract reported parameter candidates using the structured LLM extractor and exact source checks. Select up to 12 retrieved locators. Preserves conflicts; cannot approve applicability or run a simulation."""
        return session.extract(document_id, request, drug_identifier, target_identifier, locators).model_dump(mode='json')

    return [search_hypothesis_evidence, retrieve_evidence_source, extract_cited_parameters]
