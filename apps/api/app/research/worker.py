"""Isolated research process: newline JSON protocol; no provider error payloads."""
import json
import os
import sys
from threading import Event, Thread
from time import monotonic
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.tracers.langchain import wait_for_all_tracers
from pydantic import TypeAdapter
from app.agent.workflow import ResearchOutcome, run_research, scope_request
from app.config import Settings
from app.schemas.contracts import HypothesisRequest

def emit(payload):
    print(json.dumps(payload), flush=True)

def guard_supervisor(parent_pid: int, timeout_s: float) -> Event:
    """Stop even a blocked provider call if the supervisor dies or its budget expires."""
    done = Event()
    deadline = monotonic() + timeout_s
    def watch():
        while not done.wait(.1):
            if os.getppid() != parent_pid or monotonic() >= deadline:
                os._exit(2)
    Thread(target=watch, daemon=True).start()
    return done

def main():
    done = None
    try:
        payload = json.loads(sys.stdin.readline())
        done = guard_supervisor(payload["supervisor_pid"], payload["remaining_s"] + .5)
        request = HypothesisRequest.model_validate(payload["request"])
        settings = Settings(_env_file=None, **payload["settings"])
        blocked = scope_request(request)
        if blocked:
            outcome = ResearchOutcome(support=blocked)
        else:
            if not settings.nvidia_api_key:
                emit({"type": "error", "code": "credentials_missing"}); return
            if settings.hypothesim_llm_model != "nvidia/nemotron-3.5-super-vl-120b-a12b":
                raise ValueError("Unreviewed provider model")
            model = ChatNVIDIA(model=settings.hypothesim_llm_model, api_key=settings.nvidia_api_key.get_secret_value(),
                               max_completion_tokens=8192, temperature=0, timeout=min(90, settings.research_timeout_s), usage_telemetry_enabled=False)
            outcome = run_research(request, model, settings=settings,
                on_progress=lambda kind, message: emit({"type": "progress", "kind": kind, "message": message}))
            wait_for_all_tracers()
        emit({"type": "outcome", "outcome": TypeAdapter(ResearchOutcome).dump_python(outcome, mode="json")})
    except Exception:
        emit({"type": "error", "code": "research_failed"})
    finally:
        if done: done.set()

if __name__ == "__main__":
    main()
