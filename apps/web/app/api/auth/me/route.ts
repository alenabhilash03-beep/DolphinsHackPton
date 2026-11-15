import { scienceProxy } from "../../../../lib/agent-proxy";
export async function GET(request: Request) { return scienceProxy(request, "/api/auth/me"); }
