import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/health`, {
      cache: "no-store", signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("Backend unavailable");
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "API unavailable. Start the FastAPI service and retry." }, { status: 503 });
  }
}
