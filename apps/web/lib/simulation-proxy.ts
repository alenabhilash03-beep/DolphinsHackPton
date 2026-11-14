/** Server-only forwarding to FastAPI; API_BASE_URL and provider credentials stay off the client. */

const MAX_BODY_BYTES = 1_000_000;

export async function forwardSimulation(request: Request, path: "/api/simulations" | "/api/simulations/adjust"): Promise<Response> {
  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return Response.json({ detail: "Experiment request is too large." }, { status: 413 });
  }
  try {
    const backend = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (backend.status >= 500) {
      return Response.json({ detail: "The scientific API could not complete this simulation. Retry shortly." }, { status: 503 });
    }
    return new Response(await backend.text(), {
      status: backend.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ detail: "The scientific API is unavailable. Start the backend and retry." }, { status: 503 });
  }
}
