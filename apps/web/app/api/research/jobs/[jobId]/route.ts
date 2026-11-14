import { readResearch } from "../../../../../lib/research-proxy";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }): Promise<Response> {
  return readResearch((await context.params).jobId);
}
