import { submitResearch } from "../../../../lib/research-proxy";

export async function POST(request: Request): Promise<Response> {
  return submitResearch(request);
}
