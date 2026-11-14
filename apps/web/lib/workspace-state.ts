/** UI-independent scenario selection and control request construction. */

import type { ControlAdjustment, ExperimentConfig, SimulationRequest } from "./contracts";

export type ControlField = ControlAdjustment["field"];
export const GLOBAL_FIELDS: readonly ControlField[] = ["duration_h", "occupancy_threshold"];

export function editableScenarioIds(experiment: ExperimentConfig): string[] {
  return experiment.scenarios.slice(1).filter((scenario) => scenario.intervention !== "baseline").map((scenario) => scenario.scenario_id);
}

export function buildSimulationRequest(experiment: ExperimentConfig, revision: number, outputPoints = 1000): SimulationRequest {
  return { experiment, client_revision: revision, output_points: outputPoints };
}

export function buildControlAdjustment(
  experiment: ExperimentConfig,
  scenarioId: string | null,
  field: ControlField,
  value: number | null,
  revision: number,
  outputPoints = 1000,
): ControlAdjustment {
  const globalField = GLOBAL_FIELDS.includes(field);
  if (globalField && scenarioId !== null) throw new Error("Global controls apply to the entire comparison.");
  if (!globalField && (scenarioId === null || !editableScenarioIds(experiment).includes(scenarioId))) {
    throw new Error("Select an editable alternative; the baseline is protected.");
  }
  if (value === null && field !== "dosing_interval_h") throw new Error("Only the dosing interval can be cleared.");
  if (value !== null && !Number.isFinite(value)) throw new Error("Enter a finite number.");
  if (value !== null && field === "occupancy_threshold" && !(value > 0 && value < 1)) {
    throw new Error("Choose an occupancy threshold between 0 and 1.");
  }
  if (value !== null && ["dose_mg", "exposure_factor"].includes(field) && value < 0) {
    throw new Error("This control cannot be negative.");
  }
  if (value !== null && !["dose_mg", "exposure_factor", "occupancy_threshold"].includes(field) && value <= 0) {
    throw new Error("This control must be positive.");
  }
  return {
    experiment, scenario_id: scenarioId, field, value,
    client_revision: revision, output_points: outputPoints,
  };
}
