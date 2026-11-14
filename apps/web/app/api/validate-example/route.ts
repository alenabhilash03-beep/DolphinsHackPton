import { NextResponse } from "next/server";
import example from "../../../../../data/examples/contract-experiment.json";

export async function POST() {
  try {
    const response = await fetch(`${process.env.API_BASE_URL ?? "http://127.0.0.1:8000"}/api/contracts/experiments/validate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(example),
      cache: "no-store", signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("Example validation failed");
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "Could not validate the example. Check the API service and retry." }, { status: 503 });
  }
}
