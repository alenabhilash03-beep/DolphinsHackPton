/** Debounced simulation state, independent of React and visual styling. */

import type { ControlAdjustment, ExperimentConfig, SimulationRequest, SimulationResult } from "./contracts";
import { buildControlAdjustment, buildSimulationRequest, editableScenarioIds, GLOBAL_FIELDS, type ControlField } from "./workspace-state.ts";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";
export interface WorkspaceSnapshot {
  experiment: ExperimentConfig;
  result: SimulationResult | null;
  status: WorkspaceStatus;
  error: string | null;
  busy: boolean;
  pendingEdits: number;
  selectedScenarioId: string | null;
  lastTransportMs: number | null;
  lastEditToResultMs: number | null;
}
export interface SimulationTransport {
  simulate(request: SimulationRequest, signal: AbortSignal): Promise<SimulationResult>;
  adjust(request: ControlAdjustment, signal: AbortSignal): Promise<SimulationResult>;
}
interface PendingEdit {
  key: string;
  scenarioId: string | null;
  field: ControlField;
  value: number | null;
  requestedAt: number;
  resolve: (success: boolean) => void;
}

export class WorkspaceController {
  private readonly initialExperiment: ExperimentConfig;
  private readonly outputPoints: number;
  private readonly transport: SimulationTransport;
  private readonly debounceMs: number;
  private readonly now: () => number;
  private snapshot: WorkspaceSnapshot;
  private listeners = new Set<() => void>();
  private currentExperiment: ExperimentConfig;
  private latestResult: SimulationResult | null = null;
  private pending: PendingEdit[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushRequested = false;
  private active: { token: number; controller: AbortController; key?: string; resolve?: (success: boolean) => void } | null = null;
  private token = 0;
  private revision = 0;
  private started = false;

  constructor(
    initialExperiment: ExperimentConfig,
    outputPoints: number,
    transport: SimulationTransport,
    debounceMs = 150,
    now: () => number = () => performance.now(),
    initialResult: SimulationResult | null = null,
  ) {
    this.initialExperiment = initialExperiment;
    this.outputPoints = outputPoints;
    this.transport = transport;
    this.debounceMs = debounceMs;
    this.now = now;
    this.currentExperiment = initialResult?.configuration ?? initialExperiment;
    if (initialResult && initialResult.configuration.experiment_id !== initialExperiment.experiment_id) {
      throw new Error("The initial result does not belong to the supplied experiment.");
    }
    this.latestResult = initialResult;
    this.snapshot = {
      experiment: initialResult?.configuration ?? initialExperiment, result: initialResult,
      status: initialResult ? "ready" : "idle", error: null, busy: false,
      pendingEdits: 0, selectedScenarioId: editableScenarioIds(initialExperiment)[0] ?? null,
      lastTransportMs: null, lastEditToResultMs: null,
    };
  }

  getSnapshot = (): WorkspaceSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(changes: Partial<WorkspaceSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) listener();
  }
  private clearPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flushRequested = false;
    for (const item of this.pending) item.resolve(false);
    this.pending = [];
  }
  private cancelWork(): void {
    this.token++;
    this.clearPending();
    this.active?.controller.abort();
    this.active?.resolve?.(false);
    this.active = null;
  }

  start(): Promise<boolean> {
    if (this.started) return Promise.resolve(this.snapshot.status === "ready");
    this.started = true;
    if (this.latestResult) return Promise.resolve(true);
    return this.runDirect(this.currentExperiment);
  }
  stop(): void {
    this.cancelWork();
    this.started = false;
    this.publish({
      experiment: this.currentExperiment, result: this.latestResult,
      status: this.latestResult ? "ready" : "idle", busy: false, pendingEdits: 0,
    });
  }
  selectAlternative(scenarioId: string): boolean {
    if (!editableScenarioIds(this.currentExperiment).includes(scenarioId)) {
      this.publish({ error: "Select an editable alternative; the baseline is protected." });
      return false;
    }
    this.publish({ selectedScenarioId: scenarioId, error: null });
    return true;
  }

  applyControl(field: ControlField, value: number | null): Promise<boolean> {
    const scenarioId = GLOBAL_FIELDS.includes(field) ? null : this.snapshot.selectedScenarioId;
    try {
      buildControlAdjustment(this.currentExperiment, scenarioId, field, value, this.revision + 1, this.outputPoints);
    } catch (problem) {
      this.publish({ error: problem instanceof Error ? problem.message : "Invalid control value." });
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      const key = `${scenarioId ?? "global"}:${field}`;
      if (this.active?.key === key) {
        this.token++;
        this.active.controller.abort();
        this.active.resolve?.(false);
        this.active = null;
      }
      const existing = this.pending.findIndex((item) => item.key === key);
      if (existing >= 0) {
        this.pending[existing].resolve(false);
        this.pending.splice(existing, 1);
      }
      this.pending.push({ key, scenarioId, field, value, requestedAt: this.now(), resolve });
      this.publish({ status: "loading", busy: true, error: null, pendingEdits: this.pending.length });
      this.scheduleFlush();
    });
  }
  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.flushRequested = false;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushRequested = true;
      void this.flush();
    }, this.debounceMs);
  }
  private async flush(): Promise<void> {
    if (this.active || this.pending.length === 0) return;
    const item = this.pending.shift()!;
    this.publish({ pendingEdits: this.pending.length });
    let request: ControlAdjustment;
    try {
      request = buildControlAdjustment(this.currentExperiment, item.scenarioId, item.field, item.value, ++this.revision, this.outputPoints);
    } catch (problem) {
      item.resolve(false);
      this.fail(problem);
      return;
    }
    const controller = new AbortController();
    const token = ++this.token;
    this.active = { token, controller, key: item.key, resolve: item.resolve };
    const startedAt = this.now();
    try {
      const next = await this.transport.adjust(request, controller.signal);
      if (token !== this.token || controller.signal.aborted) return;
      this.currentExperiment = next.configuration;
      this.latestResult = next;
      item.resolve(true);
      this.active = null;
      if (this.pending.length > 0) {
        if (this.flushRequested || !this.timer) void this.flush();
      } else {
        this.publish({
          experiment: next.configuration, result: next, status: "ready", busy: false, error: null,
          pendingEdits: 0, lastTransportMs: this.now() - startedAt,
          lastEditToResultMs: this.now() - item.requestedAt,
        });
      }
    } catch (problem) {
      if (token !== this.token || controller.signal.aborted) return;
      item.resolve(false);
      this.active = null;
      this.fail(problem);
    }
  }
  private fail(problem: unknown): void {
    this.clearPending();
    this.publish({
      experiment: this.currentExperiment, result: this.latestResult, status: "error", busy: false,
      pendingEdits: 0,
      error: problem instanceof Error ? problem.message : "Simulation failed. Check the inputs and retry.",
    });
  }
  private async runDirect(experiment: ExperimentConfig): Promise<boolean> {
    this.cancelWork();
    const controller = new AbortController();
    const token = ++this.token;
    this.active = { token, controller };
    this.publish({ status: "loading", busy: true, error: null, pendingEdits: 0 });
    const startedAt = this.now();
    try {
      const next = await this.transport.simulate(buildSimulationRequest(experiment, ++this.revision, this.outputPoints), controller.signal);
      if (token !== this.token || controller.signal.aborted) return false;
      this.currentExperiment = next.configuration;
      this.latestResult = next;
      this.active = null;
      if (this.pending.length > 0) {
        if (this.flushRequested || !this.timer) void this.flush();
      } else {
        this.publish({
          experiment: next.configuration, result: next, status: "ready", busy: false, error: null,
          lastTransportMs: this.now() - startedAt, lastEditToResultMs: null,
        });
      }
      return true;
    } catch (problem) {
      if (token !== this.token || controller.signal.aborted) return false;
      this.active = null;
      this.fail(problem);
      return false;
    }
  }
  resetToInitial(): Promise<boolean> { return this.runDirect(this.initialExperiment); }
  refresh(): Promise<boolean> { return this.runDirect(this.currentExperiment); }
}
