/** Typed browser client for the same-origin simulation routes. No LLM endpoint is involved. */

import type { ControlAdjustment, SimulationRequest, SimulationResult } from "./contracts";

export class SimulationApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SimulationApiError";
  }
}

function errorDetail(body: unknown): string {
  if (!body || typeof body !== "object" || !("detail" in body)) return "The simulation request failed.";
  const detail = body.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.slice(0, 4).map((item: unknown) => {
      if (!item || typeof item !== "object") return "Invalid scientific input";
      const issue = item as { loc?: unknown; msg?: unknown };
      const location = Array.isArray(issue.loc) ? issue.loc.filter((part) => part !== "body").join(".") : "input";
      return `${location || "input"}: ${typeof issue.msg === "string" ? issue.msg : "invalid value"}`;
    });
    return messages.join("; ");
  }
  return "The simulation request failed.";
}

async function post<T>(path: string, payload: T, signal?: AbortSignal): Promise<SimulationResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal,
    });
  } catch {
    throw new SimulationApiError("Could not reach the scientific API. Check the connection and retry.", 503);
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new SimulationApiError(errorDetail(body), response.status);
  }
  return await response.json() as SimulationResult;
}

export function simulate(request: SimulationRequest, signal?: AbortSignal): Promise<SimulationResult> {
  return post("/api/simulations", request, signal);
}

export function adjustAndSimulate(request: ControlAdjustment, signal?: AbortSignal): Promise<SimulationResult> {
  return post("/api/simulations/adjust", request, signal);
}
