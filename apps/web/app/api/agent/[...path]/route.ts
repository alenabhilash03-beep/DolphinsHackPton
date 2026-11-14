import { agentProxy } from "../../../../lib/agent-proxy";
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return agentProxy(request, (await context.params).path);
}
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return agentProxy(request, (await context.params).path);
}
