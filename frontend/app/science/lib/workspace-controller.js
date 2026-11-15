/** Debounced simulation state, independent of React and visual styling. */ import { buildControlAdjustment, buildSimulationRequest, editableScenarioIds, GLOBAL_FIELDS } from "./workspace-state.js";
export class WorkspaceController {
    initialExperiment;
    outputPoints;
    transport;
    debounceMs;
    now;
    snapshot;
    listeners = new Set();
    currentExperiment;
    latestResult = null;
    pending = [];
    timer = null;
    flushRequested = false;
    active = null;
    token = 0;
    revision = 0;
    started = false;
    constructor(initialExperiment, outputPoints, transport, debounceMs = 150, now = ()=>performance.now(), initialResult = null){
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
            experiment: initialResult?.configuration ?? initialExperiment,
            result: initialResult,
            status: initialResult ? "ready" : "idle",
            error: null,
            busy: false,
            pendingEdits: 0,
            selectedScenarioId: editableScenarioIds(initialExperiment)[0] ?? null,
            lastTransportMs: null,
            lastEditToResultMs: null
        };
    }
    getSnapshot = ()=>this.snapshot;
    subscribe = (listener)=>{
        this.listeners.add(listener);
        return ()=>this.listeners.delete(listener);
    };
    publish(changes) {
        this.snapshot = {
            ...this.snapshot,
            ...changes
        };
        for (const listener of this.listeners)listener();
    }
    clearPending() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.flushRequested = false;
        for (const item of this.pending)item.resolve(false);
        this.pending = [];
    }
    cancelWork() {
        this.token++;
        this.clearPending();
        this.active?.controller.abort();
        this.active?.resolve?.(false);
        this.active = null;
    }
    start() {
        if (this.started) return Promise.resolve(this.snapshot.status === "ready");
        this.started = true;
        if (this.latestResult) return Promise.resolve(true);
        return this.runDirect(this.currentExperiment);
    }
    stop() {
        this.cancelWork();
        this.started = false;
        this.publish({
            experiment: this.currentExperiment,
            result: this.latestResult,
            status: this.latestResult ? "ready" : "idle",
            busy: false,
            pendingEdits: 0
        });
    }
    selectAlternative(scenarioId) {
        if (!editableScenarioIds(this.currentExperiment).includes(scenarioId)) {
            this.publish({
                error: "Select an editable alternative; the baseline is protected."
            });
            return false;
        }
        this.publish({
            selectedScenarioId: scenarioId,
            error: null
        });
        return true;
    }
    applyControl(field, value) {
        const scenarioId = GLOBAL_FIELDS.includes(field) ? null : this.snapshot.selectedScenarioId;
        try {
            buildControlAdjustment(this.currentExperiment, scenarioId, field, value, this.revision + 1, this.outputPoints);
        } catch (problem) {
            this.publish({
                error: problem instanceof Error ? problem.message : "Invalid control value."
            });
            return Promise.resolve(false);
        }
        return new Promise((resolve)=>{
            const key = `${scenarioId ?? "global"}:${field}`;
            if (this.active?.key === key) {
                this.token++;
                this.active.controller.abort();
                this.active.resolve?.(false);
                this.active = null;
            }
            const existing = this.pending.findIndex((item)=>item.key === key);
            if (existing >= 0) {
                this.pending[existing].resolve(false);
                this.pending.splice(existing, 1);
            }
            this.pending.push({
                key,
                scenarioId,
                field,
                value,
                requestedAt: this.now(),
                resolve
            });
            this.publish({
                status: "loading",
                busy: true,
                error: null,
                pendingEdits: this.pending.length
            });
            this.scheduleFlush();
        });
    }
    scheduleFlush() {
        if (this.timer) clearTimeout(this.timer);
        this.flushRequested = false;
        this.timer = setTimeout(()=>{
            this.timer = null;
            this.flushRequested = true;
            void this.flush();
        }, this.debounceMs);
    }
    async flush() {
        if (this.active || this.pending.length === 0) return;
        const item = this.pending.shift();
        this.publish({
            pendingEdits: this.pending.length
        });
        let request;
        try {
            request = buildControlAdjustment(this.currentExperiment, item.scenarioId, item.field, item.value, ++this.revision, this.outputPoints);
        } catch (problem) {
            item.resolve(false);
            this.fail(problem);
            return;
        }
        const controller = new AbortController();
        const token = ++this.token;
        this.active = {
            token,
            controller,
            key: item.key,
            resolve: item.resolve
        };
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
                    experiment: next.configuration,
                    result: next,
                    status: "ready",
                    busy: false,
                    error: null,
                    pendingEdits: 0,
                    lastTransportMs: this.now() - startedAt,
                    lastEditToResultMs: this.now() - item.requestedAt
                });
            }
        } catch (problem) {
            if (token !== this.token || controller.signal.aborted) return;
            item.resolve(false);
            this.active = null;
            this.fail(problem);
        }
    }
    fail(problem) {
        this.clearPending();
        this.publish({
            experiment: this.currentExperiment,
            result: this.latestResult,
            status: "error",
            busy: false,
            pendingEdits: 0,
            error: problem instanceof Error ? problem.message : "Simulation failed. Check the inputs and retry."
        });
    }
    async runDirect(experiment) {
        this.cancelWork();
        const controller = new AbortController();
        const token = ++this.token;
        this.active = {
            token,
            controller
        };
        this.publish({
            status: "loading",
            busy: true,
            error: null,
            pendingEdits: 0
        });
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
                    experiment: next.configuration,
                    result: next,
                    status: "ready",
                    busy: false,
                    error: null,
                    lastTransportMs: this.now() - startedAt,
                    lastEditToResultMs: null
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
    resetToInitial() {
        return this.runDirect(this.initialExperiment);
    }
    refresh() {
        return this.runDirect(this.currentExperiment);
    }
}
