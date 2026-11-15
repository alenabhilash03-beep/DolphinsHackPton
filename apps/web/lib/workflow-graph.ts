/**
 * Node graph for the live agent-workflow screen. Layout is fixed; every node and edge state is derived from the
 * workflow model, which comes only from recorded execution events.
 */
import type { StageId, StageState } from "./agent-workflow.ts";

export type NodeId = "question" | "prep" | "agent" | "search" | "reading" | "extraction" | "model" | "simulation" | "structure" | "answer";
export type NodeShape = "square" | "agent" | "circle";
export type NodeState = StageState | "thinking";
export type EdgeMode = "idle" | "flow" | "call" | "return" | "done" | "skipped";

export interface GraphNode { id: NodeId; label: string; x: number; y: number; shape: NodeShape; color: string; stage: StageId | null }
export interface GraphEdge { id: string; from: NodeId; to: NodeId; d: string; dashed: boolean }

export const VIEW = { width: 1200, height: 620 };
export const NODES: GraphNode[] = [
  { id: "question", label: "Question", x: 80, y: 300, shape: "square", color: "#34d399", stage: null },
  { id: "prep", label: "Preparation", x: 240, y: 300, shape: "square", color: "#fb923c", stage: "question" },
  { id: "agent", label: "AI Agent", x: 505, y: 300, shape: "agent", color: "#38bdf8", stage: null },
  { id: "search", label: "Literature search", x: 375, y: 505, shape: "circle", color: "#60a5fa", stage: "search" },
  { id: "reading", label: "Read sources", x: 505, y: 540, shape: "circle", color: "#c084fc", stage: "reading" },
  { id: "extraction", label: "Cited extraction", x: 635, y: 505, shape: "circle", color: "#f472b6", stage: "extraction" },
  { id: "model", label: "Model inputs", x: 790, y: 150, shape: "square", color: "#fbbf24", stage: "model" },
  { id: "simulation", label: "Simulation", x: 960, y: 150, shape: "square", color: "#4ade80", stage: "simulation" },
  { id: "structure", label: "3D structure", x: 860, y: 460, shape: "square", color: "#22d3ee", stage: "structure" },
  { id: "answer", label: "Grounded answer", x: 1120, y: 300, shape: "square", color: "#10b981", stage: "answer" },
];
const node = (id: NodeId) => NODES.find(n => n.id === id)!;
const HALF: Record<NodeShape, [number, number]> = { square: [44, 44], agent: [120, 46], circle: [40, 40] };
const right = (id: NodeId) => { const n = node(id); return [n.x + HALF[n.shape][0], n.y] as const; };
const left = (id: NodeId) => { const n = node(id); return [n.x - HALF[n.shape][0], n.y] as const; };
const top = (id: NodeId) => { const n = node(id); return [n.x, n.y - HALF[n.shape][1]] as const; };
const curve = ([x1, y1]: readonly [number, number], [x2, y2]: readonly [number, number]) => {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
};
const vertical = ([x1, y1]: readonly [number, number], [x2, y2]: readonly [number, number]) => {
  const dy = Math.max(30, Math.abs(y2 - y1) / 2);
  return `M${x1} ${y1} C${x1} ${y1 - dy} ${x2} ${y2 + dy} ${x2} ${y2}`;
};
const agentBottom = (x: number) => [x, node("agent").y + HALF.agent[1]] as const;

export const EDGES: GraphEdge[] = [
  { id: "question-prep", from: "question", to: "prep", d: curve(right("question"), left("prep")), dashed: false },
  { id: "prep-agent", from: "prep", to: "agent", d: curve(right("prep"), left("agent")), dashed: false },
  { id: "search-agent", from: "search", to: "agent", d: vertical(top("search"), agentBottom(435)), dashed: true },
  { id: "reading-agent", from: "reading", to: "agent", d: vertical(top("reading"), agentBottom(505)), dashed: true },
  { id: "extraction-agent", from: "extraction", to: "agent", d: vertical(top("extraction"), agentBottom(575)), dashed: true },
  { id: "agent-model", from: "agent", to: "model", d: curve(right("agent"), left("model")), dashed: false },
  { id: "model-simulation", from: "model", to: "simulation", d: curve(right("model"), left("simulation")), dashed: false },
  { id: "simulation-answer", from: "simulation", to: "answer", d: curve(right("simulation"), left("answer")), dashed: false },
  { id: "agent-structure", from: "agent", to: "structure", d: curve(right("agent"), left("structure")), dashed: false },
  { id: "structure-answer", from: "structure", to: "answer", d: curve(right("structure"), left("answer")), dashed: false },
];

const finished = (s: NodeState | undefined) => s === "done" || s === "warning";

/** Node and edge states for the current model. `running` is true while the agent can still act. */
export function graphState(stages: { id: StageId; state: StageState }[], running: boolean, activeStage: StageId | null, runFailed: boolean) {
  const stageState = new Map(stages.map(s => [s.id, s.state]));
  const nodeState = new Map<NodeId, NodeState>();
  for (const n of NODES) {
    if (n.id === "question") nodeState.set(n.id, "done");
    else if (n.id === "agent") nodeState.set(n.id, running ? (activeStage ? "active" : "thinking") : runFailed ? "failed" : "done");
    else nodeState.set(n.id, stageState.get(n.stage!) ?? "waiting");
  }
  const edgeMode = new Map<string, EdgeMode>();
  for (const e of EDGES) {
    const from = nodeState.get(e.from), to = nodeState.get(e.to);
    let mode: EdgeMode = "idle";
    if (e.dashed) {
      // Tool links: the agent calls the tool (packets to the tool), then the result returns (packets to the agent).
      const tool = nodeState.get(e.from);
      mode = tool === "active" ? "call" : finished(tool) ? (running ? "return" : "done") : tool === "skipped" ? "skipped" : tool === "failed" ? "done" : "idle";
    } else if (to === "active") mode = "flow";
    else if (e.id === "prep-agent") mode = running ? "flow" : finished(from) ? "done" : "idle";
    // Links leaving the agent complete when their target has an outcome; others also need a finished source.
    else if ((e.from === "agent" || finished(from)) && (finished(to) || to === "failed")) mode = "done";
    else if (to === "skipped" || from === "skipped") mode = "skipped";
    edgeMode.set(e.id, mode);
  }
  return { nodeState, edgeMode };
}
