import { streamResearch } from "../../../../../../lib/research-proxy";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  return streamResearch((await context.params).jobId, request);
}
