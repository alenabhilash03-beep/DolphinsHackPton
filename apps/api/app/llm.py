"""NVIDIA chat model that always streams its response (5C.1b).

Live finding: a non-streaming completion that takes longer than about 30 s fails at the HTTP gateway with
502 "upstream request failed", while the same request streamed completes (verified 41 s). Agent turns with
larger research context routinely exceed 30 s. Streaming keeps the connection active; LangChain aggregates
the chunks, including tool-call chunks, into the same message an ordinary call returns.
"""
from langchain_nvidia_ai_endpoints import ChatNVIDIA


class StreamingChatNVIDIA(ChatNVIDIA):
    def _should_stream(self, *, async_api: bool, run_manager=None, **kwargs) -> bool:
        return True
