"use client";

import { useEffect, useState } from "react";
import type { ContractValidation, HealthResponse } from "../lib/contracts";

export function FoundationStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<ContractValidation | null>(null);

  async function check() {
    setBusy(true); setError(""); setValidation(null); setHealth(null);
    try {
      const response = await fetch("/api/backend-health", { cache: "no-store" });
      if (!response.ok) throw new Error("The API is offline. Start the backend and retry.");
      const data: HealthResponse = await response.json();
      setHealth(data);
      const result = await fetch("/api/validate-example", { method: "POST" });
      if (!result.ok) throw new Error("The API is online, but the example could not be validated.");
      setValidation(await result.json());
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Service check failed.");
    } finally { setBusy(false); }
  }

  useEffect(() => { void check(); }, []);

  return <section className="rounded-2xl border border-[#d7e1d4] bg-white p-6 sm:p-8" aria-labelledby="foundation-heading">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 id="foundation-heading" className="text-lg font-semibold">Workspace foundation</h2>
      <button onClick={() => void check()} disabled={busy} className="rounded-full border border-[#9aaf9b] px-4 py-2 text-sm font-medium">{busy ? "Checking…" : "Check services"}</button>
    </div>
    <div role="status" aria-live="polite" className="mt-6 space-y-4 text-sm">
      <p><span className={`mr-2 inline-block h-2 w-2 rounded-full ${health ? "bg-[#3f7444]" : "bg-[#b8bdb3]"}`} />{health ? "Scientific API connected" : busy ? "Connecting to scientific API…" : "Scientific API not connected"}</p>
      {validation && <p>Example configuration validated · {validation.scenario_count} scenarios · <strong>{validation.support_status}</strong> scientific scope</p>}
      {health?.simulation_available && <p>Numerical simulation API ready · interactive controls and graphs arrive in Phase 2</p>}
      {health && <p className="text-[#637168]">NVIDIA credentials: {health.ai_credentials_configured ? "configured" : "not configured"} · LangSmith credentials: {health.tracing_credentials_configured ? "configured" : "not configured"}. AI compatibility is verified separately from service health.</p>}
      {error && <p className="rounded-lg bg-[#fff3e8] p-3 text-[#824a23]">{error}</p>}
    </div>
    <p className="mt-6 border-t border-[#e5ebe1] pt-5 text-sm leading-6 text-[#637168]">This preview checks the service and experiment format. The deterministic engine runs through the API; the interactive workspace, literature research, and molecular rendering arrive in later chunks.</p>
  </section>;
}
