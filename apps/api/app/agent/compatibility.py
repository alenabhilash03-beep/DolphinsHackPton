"""Small capability probe; never substitutes for a research agent or simulation."""
from typing import Literal

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy, ToolStrategy
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.tools import tool
from pydantic import BaseModel, ConfigDict


class ProbeReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    marker: str
    support_status: Literal["needs_parameters"]
    association_rate: float | None
    dissociation_rate: float | None
    citation_ids: list[str]


def build_probe(model: BaseChatModel, marker: str, *, native: bool = True):
    calls: list[str] = []

    @tool
    def read_contract_marker() -> str:
        """Read the marker for this compatibility check. Never guess it."""
        calls.append("read_contract_marker")
        return marker

    @tool
    def lookup_unknown_control() -> dict:
        """Read the parameter availability for an intentionally unknown control drug."""
        calls.append("lookup_unknown_control")
        return {"support_status": "needs_parameters", "association_rate": None,
                "dissociation_rate": None, "citation_ids": []}

    agent = create_agent(
        model=model,
        tools=[read_contract_marker, lookup_unknown_control],
        response_format=ProviderStrategy(ProbeReport, strict=True) if native else ToolStrategy(ProbeReport),
        system_prompt=("This is a capability check, not scientific research. Before your final response, "
                       "call read_contract_marker and lookup_unknown_control. Return their exact values "
                       "in the required schema. Never invent missing rates or citations. "
                       "Do not use general knowledge to fill missing parameters."),
    )
    return agent, calls


def verify_probe(state: dict, calls: list[str], marker: str) -> ProbeReport:
    report = ProbeReport.model_validate(state["structured_response"])
    if not {"read_contract_marker", "lookup_unknown_control"} <= set(calls):
        raise ValueError("Expected tools were not executed")
    if report.marker != marker or report.association_rate is not None or report.dissociation_rate is not None or report.citation_ids:
        raise ValueError("The provider invented or changed a tool result")
    return report
