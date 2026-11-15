import { scienceProxy } from "../../../../lib/agent-proxy";
async function shareId(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return /^shr-[a-f0-9]{32}$/.test(id) ? id : null;
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await shareId(context);
  return id ? scienceProxy(request, `/api/shares/${id}`) : Response.json({ detail: "Invalid share link" }, { status: 400 });
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await shareId(context);
  return id ? scienceProxy(request, `/api/shares/${id}`) : Response.json({ detail: "Invalid share link" }, { status: 400 });
}
