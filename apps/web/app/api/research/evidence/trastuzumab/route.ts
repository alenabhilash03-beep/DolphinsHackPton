import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const backend = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/research/evidence/trastuzumab`, {
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!backend.ok) throw new Error("Evidence profile unavailable");
    return new Response(await backend.text(), {
      status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ detail: "Evidence metadata unavailable. The simulator remains usable." }, { status: 503 });
  }
}
