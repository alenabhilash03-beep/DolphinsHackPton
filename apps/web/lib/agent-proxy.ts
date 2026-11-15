/** Fixed-path, server-only forwarding. No server credentials or arbitrary upstream URLs. */

/** The caller's own sign-in token, forwarded unchanged so FastAPI can identify the user. */
export function forwardedAuth(request: Request): Record<string, string> {
  const value = request.headers.get("authorization");
  return value && /^Bearer [A-Za-z0-9._~+/=-]{20,4096}$/.test(value) ? { Authorization: value } : {};
}
export async function agentProxy(request: Request, parts: string[]): Promise<Response> {
  const suffix = parts.join("/");
  const allowed = request.method === "POST" ? /^(jobs\/(research|edits))$/.test(suffix)
    : /^(jobs\/[a-f0-9]{32}|turns\/turn-[a-f0-9]{32}|results\/[A-Za-z0-9-]{1,120}(\/proposals)?|investigations\/[A-Za-z0-9-]{1,120})$/.test(suffix);
  if (!allowed) return Response.json({ detail: "Unknown agent route" }, { status: 404 });
  return scienceProxy(request, `/api/agent/${suffix}`);
}
export async function scienceProxy(request: Request, path: string, timeoutMs = 15_000): Promise<Response> {
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body && new TextEncoder().encode(body).length > 1_000_000)
    return Response.json({ detail: "Scientific request is too large" }, { status: 413 });
  try {
    const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}${path}`, {
      method: request.method, body, headers: { "Content-Type": "application/json", ...forwardedAuth(request) }, cache: "no-store", signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 204) return new Response(null, { status: 204 });
    return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch { return Response.json({ detail: "Scientific API unavailable. Existing curves are preserved." }, { status: 503 }); }
}
