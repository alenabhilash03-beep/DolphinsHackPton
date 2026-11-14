"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ExperimentConfig, SimulationResult } from "../lib/contracts";
import { adjustAndSimulate, simulate } from "../lib/simulation-client";
import { editableScenarioIds } from "../lib/workspace-state";
import { WorkspaceController } from "../lib/workspace-controller";

/** Headless workspace API; pass a stable initialExperiment object. */
export function useExperimentWorkspace(initialExperiment: ExperimentConfig, outputPoints = 1000, initialResult: SimulationResult | null = null) {
  const controller = useMemo(() => new WorkspaceController(initialExperiment, outputPoints, {
    simulate,
    adjust: adjustAndSimulate,
  }, 150, () => performance.now(), initialResult), [initialExperiment, outputPoints, initialResult]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    void controller.start();
    return () => controller.stop();
  }, [controller]);

  return {
    ...snapshot,
    editableScenarioIds: editableScenarioIds(snapshot.experiment),
    baseline: snapshot.experiment.scenarios[0],
    alternatives: snapshot.experiment.scenarios.slice(1),
    selectAlternative: (scenarioId: string) => controller.selectAlternative(scenarioId),
    applyControl: (field: Parameters<WorkspaceController["applyControl"]>[0], value: number | null) => controller.applyControl(field, value),
    resetToInitial: () => controller.resetToInitial(),
    refresh: () => controller.refresh(),
  };
}
