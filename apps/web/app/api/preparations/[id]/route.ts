import { scienceProxy } from "../../../../lib/agent-proxy";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^prep-[a-f0-9]{32}$/.test(id)) return Response.json({ detail: "Invalid preparation ID" }, { status: 400 });
  return scienceProxy(request, `/api/preparations/${id}`);
}
