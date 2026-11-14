"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExperimentConfig, SimulationResult } from "../lib/contracts";
import { adjustAndSimulate, simulate } from "../lib/simulation-client";
import {
  buildControlAdjustment, buildSimulationRequest, editableScenarioIds, GLOBAL_FIELDS,
  type ControlField,
} from "../lib/workspace-state";

export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

/** Headless workspace API for the visual UI; the backend resolves linked controls. */
export function useExperimentWorkspace(initialExperiment: ExperimentConfig, outputPoints = 1000) {
  const originalRef = useRef(initialExperiment);
  const currentRef = useRef(initialExperiment);
  const revisionRef = useRef(0);
  const requestRef = useRef(0);
  const activeRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const [experiment, setExperiment] = useState(initialExperiment);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    editableScenarioIds(initialExperiment)[0] ?? null,
  );

  const execute = useCallback(async (
    request: ReturnType<typeof buildSimulationRequest> | ReturnType<typeof buildControlAdjustment>,
    kind: "simulate" | "adjust",
  ): Promise<boolean> => {
    if (busyRef.current) {
      setError("Wait for the current simulation to finish before editing again.");
      return false;
    }
    busyRef.current = true;
    const id = ++requestRef.current;
    const controller = new AbortController();
    activeRef.current = controller;
    setStatus("loading");
    setError(null);
    try {
      const next = kind === "adjust"
        ? await adjustAndSimulate(request as ReturnType<typeof buildControlAdjustment>, controller.signal)
        : await simulate(request as ReturnType<typeof buildSimulationRequest>, controller.signal);
      if (id !== requestRef.current || controller.signal.aborted) return false;
      currentRef.current = next.configuration;
      setExperiment(next.configuration);
      setResult(next);
      setStatus("ready");
      return true;
    } catch (problem) {
      if (id !== requestRef.current || controller.signal.aborted) return false;
      setError(problem instanceof Error ? problem.message : "Simulation failed. Check the scientific inputs and retry.");
      setStatus("error");
      return false;
    } finally {
      if (id === requestRef.current) {
        busyRef.current = false;
        activeRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    originalRef.current = initialExperiment;
    currentRef.current = initialExperiment;
    revisionRef.current = 0;
    setExperiment(initialExperiment);
    setResult(null);
    setSelectedScenarioId(editableScenarioIds(initialExperiment)[0] ?? null);
    void execute(buildSimulationRequest(initialExperiment, ++revisionRef.current, outputPoints), "simulate");
    return () => {
      requestRef.current++;
      activeRef.current?.abort();
      activeRef.current = null;
      busyRef.current = false;
    };
  }, [initialExperiment, outputPoints, execute]);

  const selectAlternative = useCallback((scenarioId: string) => {
    if (!editableScenarioIds(currentRef.current).includes(scenarioId)) {
      setError("Select an editable alternative; the baseline is protected.");
      return false;
    }
    setSelectedScenarioId(scenarioId);
    setError(null);
    return true;
  }, []);

  const applyControl = useCallback(async (field: ControlField, value: number | null): Promise<boolean> => {
    try {
      const scenarioId = GLOBAL_FIELDS.includes(field) ? null : selectedScenarioId;
      const request = buildControlAdjustment(
        currentRef.current, scenarioId, field, value, ++revisionRef.current, outputPoints,
      );
      return await execute(request, "adjust");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Invalid control value.");
      return false;
    }
  }, [selectedScenarioId, outputPoints, execute]);

  const resetToInitial = useCallback(async (): Promise<boolean> => {
    return await execute(buildSimulationRequest(originalRef.current, ++revisionRef.current, outputPoints), "simulate");
  }, [outputPoints, execute]);

  const refresh = useCallback(async (): Promise<boolean> => {
    return await execute(buildSimulationRequest(currentRef.current, ++revisionRef.current, outputPoints), "simulate");
  }, [outputPoints, execute]);

  return {
    experiment, result, status, error,
    busy: status === "loading",
    selectedScenarioId,
    editableScenarioIds: editableScenarioIds(experiment),
    baseline: experiment.scenarios[0],
    alternatives: experiment.scenarios.slice(1),
    selectAlternative, applyControl, resetToInitial, refresh,
  };
}
