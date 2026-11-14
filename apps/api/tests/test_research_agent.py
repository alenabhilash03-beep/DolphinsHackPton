"""Offline LangChain harness checks; live provider quality is tested separately."""

import pytest
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import PrivateAttr

from app.agent.workflow import run_research
from app.config import Settings
from app.research.europe_pmc import RetrievalError, SourceMismatchError
from app.research.registry import load_cached_record, load_curated_profile
from app.schemas.contracts import HypothesisRequest

PRIMARY = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"
SETTINGS = Settings(_env_file=None, nvidia_api_key=None, langsmith_api_key=None, langsmith_tracing=False)


class ScriptedModel(BaseChatModel):
    responses: list[AIMessage]
    _index: int = PrivateAttr(default=0)

    @property
    def _llm_type(self):
        return "offline-scripted-research-check"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        response = self.responses[self._index]
        self._index += 1
        return ChatResult(generations=[ChatGeneration(message=response)])


class FakeLiterature:
    def lookup_pmid(self, pmid):
        check = next(item for item in load_curated_profile().literature_checks if item.pmid == pmid)
        return load_cached_record(check)


class OfflineLiterature:
    def lookup_pmid(self, pmid):
        raise RetrievalError("Provider offline")


class MismatchedLiterature(FakeLiterature):
    def lookup_pmid(self, pmid):
        return super().lookup_pmid(pmid).model_copy(update={"doi": "10.0000/unrelated"})


class WrongPmidLiterature:
    def lookup_pmid(self, pmid):
        raise SourceMismatchError("Wrong PMID from provider")


def scripted_model(result_id="sim-262bc1bc1e17aefb3d6995d5", cited=None):
    report = {
        "drug": "trastuzumab", "target": "HER2",
        "intervention_ids": ["half_life_x3", "affinity_x10"],
        "predicted_outcome": "Compare occupancy retention under the registered conditional model",
        "support_status": "conditional", "experiment_id": "trastuzumab-her2-reviewed-v1",
        "result_id": result_id,
        "cited_evidence_ids": cited or ["volume", "clearance", "kon", "koff"],
        "follow_up_codes": ["measure_target_site_exposure", "extend_washout_window"],
    }
    return ScriptedModel(responses=[
        AIMessage(content="", tool_calls=[
            {"name": "read_reviewed_profile", "args": {}, "id": "profile"},
            {"name": "verify_primary_literature", "args": {}, "id": "literature"},
            {"name": "simulate_reviewed_comparison", "args": {}, "id": "simulation"},
        ]),
        AIMessage(content="", tool_calls=[{"name": "AgentReport", "args": report, "id": "final"}]),
    ])


def test_primary_agent_calls_retrieval_and_solver_then_links_interpretation():
    outcome = run_research(HypothesisRequest(text=PRIMARY), scripted_model(), literature=FakeLiterature(), settings=SETTINGS)
    assert set(outcome.tool_calls) == {"read_reviewed_profile", "verify_primary_literature", "simulate_reviewed_comparison"}
    assert outcome.result is not None and outcome.interpretation is not None
    assert outcome.result.result_id == outcome.interpretation.result_id
    assert outcome.support.status == "conditional"
    assert outcome.retrieval_status == "live"
    assert any("censored" in claim for claim in outcome.interpretation.claims)
    assert all("no simulator has run" not in limit for limit in outcome.interpretation.limitations)
    assert outcome.trace_status == "local_collected"
    assert {"verify_primary_literature", "simulate_reviewed_comparison"} <= set(outcome.trace_tool_names)


def test_provider_outage_uses_labeled_cache_and_still_runs_reviewed_model():
    outcome = run_research(HypothesisRequest(text=PRIMARY), scripted_model(), literature=OfflineLiterature(), settings=SETTINGS)
    assert outcome.retrieval_status == "cached_degraded"
    assert outcome.result is not None
    assert outcome.interpretation.evidence_ids == ["volume", "clearance", "kon", "koff"]


def test_unknown_drug_and_route_stop_before_any_model_call():
    model = scripted_model()
    unknown = run_research(HypothesisRequest(text="What happens when imatinib binds Abl?", drug="imatinib"),
                           model, literature=FakeLiterature(), settings=SETTINGS)
    assert unknown.support.status == "unsupported" and unknown.result is None and model._index == 0
    route = run_research(HypothesisRequest(text=PRIMARY, route="subcutaneous"), model,
                         literature=FakeLiterature(), settings=SETTINGS)
    assert route.support.status == "unsupported" and route.result is None and model._index == 0
    wrong_target = run_research(HypothesisRequest(text=PRIMARY, target="Abl"), model,
                                literature=FakeLiterature(), settings=SETTINGS)
    assert wrong_target.support.status == "unsupported" and wrong_target.result is None and model._index == 0


def test_falsified_result_or_evidence_is_rejected_after_tool_execution():
    with pytest.raises(ValueError, match="computed experiment/result"):
        run_research(HypothesisRequest(text=PRIMARY), scripted_model(result_id="sim-fabricated"),
                     literature=FakeLiterature(), settings=SETTINGS)
    with pytest.raises(ValueError, match="omitted required"):
        run_research(HypothesisRequest(text=PRIMARY), scripted_model(cited=["volume"]),
                     literature=FakeLiterature(), settings=SETTINGS)


def test_unregistered_intervention_cannot_be_silently_reframed():
    request = HypothesisRequest(text="What if trastuzumab were given orally to improve HER2 occupancy?")
    outcome = run_research(request, scripted_model(), literature=FakeLiterature(), settings=SETTINGS)
    assert outcome.support.status == "unsupported" and outcome.result is None
    text_route = HypothesisRequest(text=PRIMARY + " Give the antibody orally.")
    outcome = run_research(text_route, scripted_model(), literature=FakeLiterature(), settings=SETTINGS)
    assert outcome.support.status == "unsupported" and outcome.result is None
    extra_change = HypothesisRequest(text=PRIMARY + " Also double the dose.")
    outcome = run_research(extra_change, scripted_model(), literature=FakeLiterature(), settings=SETTINGS)
    assert outcome.support.status == "unsupported" and outcome.result is None


def test_mismatched_live_source_and_missing_remote_trace_fail_closed():
    with pytest.raises(ValueError, match="identifiers"):
        run_research(HypothesisRequest(text=PRIMARY), scripted_model(), literature=MismatchedLiterature(), settings=SETTINGS)
    with pytest.raises(SourceMismatchError, match="Wrong PMID"):
        run_research(HypothesisRequest(text=PRIMARY), scripted_model(), literature=WrongPmidLiterature(), settings=SETTINGS)
    with pytest.raises(RuntimeError, match="LangSmith credentials"):
        run_research(HypothesisRequest(text=PRIMARY), scripted_model(), literature=FakeLiterature(),
                     settings=SETTINGS, require_remote_trace=True)
