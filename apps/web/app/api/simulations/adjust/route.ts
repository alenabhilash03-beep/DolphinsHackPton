import { forwardSimulation } from "../../../../lib/simulation-proxy";

export async function POST(request: Request): Promise<Response> {
  return forwardSimulation(request, "/api/simulations/adjust");
}
