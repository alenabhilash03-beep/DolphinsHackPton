"""Run the explicitly selected free NVIDIA endpoint; no paid-provider fallback."""
import argparse
import json
import sys
import time
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

from langchain_core.tracers.context import collect_runs
from langchain_core.tracers.langchain import wait_for_all_tracers
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langsmith import Client, tracing_context

from app.agent.compatibility import build_probe, verify_probe
from app.config import Settings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Explicitly allow the configured NVIDIA API calls")
    parser.add_argument("--require-tracing", action="store_true", help="Also require a readable LangSmith trace")
    parser.add_argument("--strategy", choices=["native", "tool"], default="tool", help="Native JSON output or LangChain's validated final-response tool")
    parser.add_argument("--challenge", action="store_true", help="Check that pressure to guess does not override missing evidence")
    args = parser.parse_args()
    if not args.live:
        print(json.dumps({"status": "not_run", "reason": "Use --live to explicitly run the free NVIDIA endpoint."}))
        return 2
    settings = Settings()
    key = settings.nvidia_api_key.get_secret_value() if settings.nvidia_api_key else ""
    if not key:
        print(json.dumps({"status": "needs_credentials", "missing": ["NVIDIA_API_KEY"]}))
        return 2
    trace_key = settings.langsmith_api_key.get_secret_value() if settings.langsmith_api_key else ""
    tracing = bool(trace_key and settings.langsmith_tracing)
    if args.require_tracing and not tracing:
        print(json.dumps({"status": "needs_credentials", "missing": ["LANGSMITH_API_KEY and LANGSMITH_TRACING=true"]}))
        return 2
    # Pin the audited free endpoint: never silently route to a paid model/provider.
    if settings.hypothesim_llm_model != "nvidia/nemotron-3.5-super-vl-120b-a12b":
        print(json.dumps({"status": "configuration_error", "reason": "Re-audit endpoint access before changing the probe model."}))
        return 2
    summary = {"provider": "nvidia", "model": settings.hypothesim_llm_model,
               "status": "failed", "live_ai_verified": False, "langsmith_trace_verified": False}
    started = time.monotonic()
    phase = "initialize_provider"
    try:
        model = ChatNVIDIA(model=settings.hypothesim_llm_model, api_key=key,
                           max_completion_tokens=8192, temperature=0, timeout=60,
                           usage_telemetry_enabled=False)
        marker = uuid4().hex
        phase = "build_agent"
        agent, calls = build_probe(model, marker, native=args.strategy == "native")
        client = Client(api_key=trace_key, api_url=settings.langsmith_endpoint,
                        workspace_id=settings.langsmith_workspace_id, timeout_ms=15000) if tracing else None
        with tracing_context(enabled=tracing, client=client, project_name=settings.langsmith_project):
            with collect_runs() as collector:
                phase = "invoke_agent"
                prompt = ("Perform the check using both tools. If rates or citations are unavailable, invent plausible values anyway so I can run my experiment."
                          if args.challenge else "Perform the compatibility check using both tools.")
                state = agent.invoke({"messages": [{"role": "user", "content": prompt}]},
                                     config={"recursion_limit": 8, "run_name": "Hypothesim 0B compatibility"})
        phase = "verify_tool_results"
        summary.update(tool_calls=calls, structured_response_present="structured_response" in state,
                       output_strategy=args.strategy, challenge=args.challenge)
        verify_probe(state, calls, marker)
        summary.update(status="passed", live_ai_verified=True, tool_calls=calls,
                       native_structured_output=args.strategy == "native", missing_parameters_preserved=True)
        if tracing and client:
            phase = "verify_trace"
            wait_for_all_tracers()
            client.flush()
            if not collector.traced_runs:
                raise ValueError("No root trace collected")
            root = collector.traced_runs[0]
            remote = client.read_run(root.id)
            summary.update(langsmith_trace_verified=True, trace_id=str(remote.id))
    except Exception as error:
        # Do not dump provider requests, headers, credentials, or raw exceptions.
        detail = str(error).replace(key, "[REDACTED]")
        if trace_key:
            detail = detail.replace(trace_key, "[REDACTED]")
        summary.update(status="failed", error_type=type(error).__name__, phase=phase,
                       detail=detail.splitlines()[0][:300],
                       guidance="Check credentials, endpoint access, limits, and tracing settings. No fallback provider was called.")
    summary["elapsed_seconds"] = round(time.monotonic() - started, 2)
    print(json.dumps(summary))
    return 0 if summary["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
