from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langsmith import tracing_context
from pydantic import PrivateAttr

from app.agent.compatibility import build_probe, verify_probe


class ScriptedModel(BaseChatModel):
    """Offline harness check. This is explicitly not a live model-quality test."""
    responses: list[AIMessage]
    _index: int = PrivateAttr(default=0)

    @property
    def _llm_type(self):
        return "offline-scripted-compatibility-check"

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        response = self.responses[self._index]
        self._index += 1
        return ChatResult(generations=[ChatGeneration(message=response)])


def test_langchain_executes_tools_and_validates_structured_result_offline():
    marker = "offline-marker-from-tool"
    report = {"marker": marker, "support_status": "needs_parameters", "association_rate": None,
              "dissociation_rate": None, "citation_ids": []}
    model = ScriptedModel(responses=[
        AIMessage(content="", tool_calls=[{"name": "read_contract_marker", "args": {}, "id": "marker"},
                                          {"name": "lookup_unknown_control", "args": {}, "id": "unknown"}]),
        AIMessage(content="", tool_calls=[{"name": "ProbeReport", "args": report, "id": "final"}]),
    ])
    agent, calls = build_probe(model, marker, native=False)
    with tracing_context(enabled=False):
        result = agent.invoke({"messages": [{"role": "user", "content": "Run the offline check."}]})
    assert verify_probe(result, calls, marker).association_rate is None
