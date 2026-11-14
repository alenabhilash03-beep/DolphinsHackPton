"""Run the Phase 3B research agent on the selected free NVIDIA endpoint."""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

from langchain_nvidia_ai_endpoints import ChatNVIDIA  # noqa: E402

from app.agent.workflow import run_research  # noqa: E402
from app.config import Settings  # noqa: E402
from app.schemas.contracts import HypothesisRequest  # noqa: E402

PRIMARY = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?"
PINNED_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Explicitly make requests to the configured NVIDIA endpoint")
    parser.add_argument("--require-tracing", action="store_true", help="Require a readable remote LangSmith trace")
    parser.add_argument("--text", default=PRIMARY, help="Hypothesis text; 3B only supports the audited primary comparison")
    args = parser.parse_args()
    settings = Settings()
    key = settings.nvidia_api_key.get_secret_value() if settings.nvidia_api_key else ""
    if not args.live:
        print(json.dumps({"status": "not_run", "reason": "Pass --live to use the NVIDIA endpoint."}))
        return 2
    if not key:
        print(json.dumps({"status": "needs_credentials", "missing": ["NVIDIA_API_KEY"]}))
        return 2
    if settings.hypothesim_llm_model != PINNED_MODEL:
        print(json.dumps({"status": "configuration_error", "reason": "Re-audit access before changing the pinned free model."}))
        return 2
    if args.require_tracing and not (settings.langsmith_api_key and settings.langsmith_tracing):
        print(json.dumps({"status": "needs_credentials", "missing": ["LANGSMITH_API_KEY and LANGSMITH_TRACING=true"]}))
        return 2
    started = time.monotonic()
    try:
        model = ChatNVIDIA(model=PINNED_MODEL, api_key=key, max_completion_tokens=8192,
                           temperature=0, timeout=90, usage_telemetry_enabled=False)
        outcome = run_research(HypothesisRequest(text=args.text), model, settings=settings,
                               require_remote_trace=args.require_tracing)
        payload = {
            "status": "passed" if outcome.result else "blocked",
            "support_status": outcome.support.status,
            "retrieval_status": outcome.retrieval_status,
            "tool_calls": outcome.tool_calls,
            "trace_status": outcome.trace_status,
            "trace_id": outcome.trace_id,
            "trace_tool_names": outcome.trace_tool_names,
            "result_id": outcome.result.result_id if outcome.result else None,
            "claims": outcome.interpretation.claims if outcome.interpretation else [],
            "elapsed_seconds": round(time.monotonic() - started, 2),
        }
        print(json.dumps(payload))
        return 0 if outcome.result else 2
    except Exception as error:
        detail = str(error).replace(key, "[REDACTED]")
        trace_key = settings.langsmith_api_key.get_secret_value() if settings.langsmith_api_key else ""
        if trace_key:
            detail = detail.replace(trace_key, "[REDACTED]")
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "detail": detail.splitlines()[0][:300],
                          "elapsed_seconds": round(time.monotonic() - started, 2)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
