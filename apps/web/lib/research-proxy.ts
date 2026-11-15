import { forwardedAuth } from "./agent-proxy";
/** Server-only research forwarding; credentials remain in FastAPI. */

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export async function submitResearch(request: Request, path: "/api/research/jobs" | "/api/research/assess" = "/api/research/jobs"): Promise<Response> {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 20_000) {
    return Response.json({ detail: "Hypothesis request is too large." }, { status: 413 });
  }
  try {
    const backend = await fetch(`${BASE}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...forwardedAuth(request) }, body,
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    return new Response(await backend.text(), { status: backend.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store",
        ...(backend.headers.get("retry-after") ? { "Retry-After": backend.headers.get("retry-after")! } : {}) } });
  } catch {
    return Response.json({ detail: "Research API unavailable; direct simulation remains usable." }, { status: 503 });
  }
}

export async function readResearch(jobId: string): Promise<Response> {
  if (!/^[a-f0-9]{32}$/.test(jobId)) return Response.json({ detail: "Invalid job ID" }, { status: 400 });
  try {
    const backend = await fetch(`${BASE}/api/research/jobs/${jobId}`, {
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    return new Response(await backend.text(), { status: backend.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ detail: "Research status unavailable; direct simulation remains usable." }, { status: 503 });
  }
}

export async function streamResearch(jobId: string, request: Request): Promise<Response> {
  if (!/^[a-f0-9]{32}$/.test(jobId)) return Response.json({ detail: "Invalid job ID" }, { status: 400 });
  try {
    const backend = await fetch(`${BASE}/api/research/jobs/${jobId}/events`, {
      headers: { "Accept": "text/event-stream", "Last-Event-ID": request.headers.get("last-event-id") ?? "0" },
      cache: "no-store", signal: request.signal,
    });
    if (!backend.ok || !backend.body) {
      return Response.json({ detail: "Research progress unavailable." }, { status: backend.status });
    }
    return new Response(backend.body, { status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch {
    return Response.json({ detail: "Research progress unavailable." }, { status: 503 });
  }
}
