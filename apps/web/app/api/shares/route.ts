import { scienceProxy } from "../../../lib/agent-proxy";
// Sharing writes an AI summary server-side, which can take tens of seconds.
export const maxDuration = 60;
export async function GET(request: Request) { return scienceProxy(request, "/api/shares"); }
export async function POST(request: Request) { return scienceProxy(request, "/api/shares", 58_000); }
