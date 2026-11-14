"use client";

import { useEffect, useState } from "react";
import type { useExperimentWorkspace } from "../hooks/useExperimentWorkspace";
import { KINETIC_RANGES, fromLogPosition, toLogPosition, type KineticField } from "../lib/log-control";
import type { ControlField } from "../lib/workspace-state";

type Workspace = ReturnType<typeof useExperimentWorkspace>;

/** Native technical controls for checking the data path; the UI team owns presentation. */
export function PreviewControls({ workspace }: { workspace: Workspace }) {
  const selected = workspace.experiment.scenarios.find((scenario) => scenario.scenario_id === workspace.selectedScenarioId);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [intervalText, setIntervalText] = useState("");
  useEffect(() => {
    setDrafts({});
    setIntervalText(selected?.dosing_interval_h?.toString() ?? "");
  }, [workspace.experiment, workspace.selectedScenarioId, selected?.dosing_interval_h]);

  const valueFor = (field: ControlField, actual: number): number => drafts[field] ?? actual;
  const edit = (field: ControlField, value: number) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    void workspace.applyControl(field, value);
  };
  const range = (field: ControlField, label: string, actual: number, min: number, max: number, step: number, unit: string) =>
    <label style={{ display: "block", margin: "8px 0" }}>
      {label}: <output>{valueFor(field, actual).toFixed(step < 1 ? 2 : 0)} {unit}</output>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={valueFor(field, actual)}
        onChange={(event) => edit(field, Number(event.target.value))} style={{ display: "block", width: "100%" }} />
    </label>;
  const kinetic = (field: KineticField, label: string, actual: number) => {
    const bounds = KINETIC_RANGES[field];
    const shown = valueFor(field, actual);
    return <label style={{ display: "block", margin: "8px 0" }}>
      {label}: <output>{shown.toExponential(3)} {bounds.unit}</output>
      <input aria-label={label} type="range" min={0} max={1} step={0.001}
        value={toLogPosition(shown, bounds.min, bounds.max)}
        onChange={(event) => edit(field, fromLogPosition(Number(event.target.value), bounds.min, bounds.max))}
        style={{ display: "block", width: "100%" }} />
    </label>;
  };

  const exact = (field: ControlField, label: string, actual: number, unit: string) => <label style={{display:"block",margin:"8px 0"}}>
    {label} ({unit})<input key={`${selected?.scenario_id ?? "global"}:${field}:${actual}`} type="number" step="any" defaultValue={actual}
      onBlur={event=>{if(event.currentTarget.value.trim()){const next=Number(event.currentTarget.value);if(Number.isFinite(next)&&next!==actual)edit(field,next);}}}/>
  </label>;
  return <section aria-label="Experiment parameter controls">
    <h3>Adjust conditions</h3>
    <p>Select an alternative, then move a slider to recalculate the curves. The baseline stays fixed.</p>
    <label>Editing alternative<select value={workspace.selectedScenarioId ?? ""}
      onChange={(event) => workspace.selectAlternative(event.target.value)}>
      {workspace.alternatives.map((scenario) => <option key={scenario.scenario_id} value={scenario.scenario_id}>{scenario.label}</option>)}
    </select></label>
    {!workspace.alternatives.length && <p>Only a protected baseline is prepared. Use “Compare twofold and fivefold affinity improvement at fixed association rate” above to create editable alternatives.</p>}
    {selected && <><p className="parameter-hint">Lower KD means stronger affinity. Changing KD adjusts dissociation while keeping association fixed.</p>
      {selected.administration.every(event=>event.kind==="infusion") ? range("dose_mg", "Infusion amount", selected.administration[0].amount_mg, 0, Math.max(1500,selected.administration[0].amount_mg*2), 1, "mg") : <p>Dose and repeat-interval controls support finite infusions only. Kinetic and observation-window controls remain available.</p>}
      {range("pk.elimination_half_life_h", "Effective half-life", selected.pk.elimination_half_life_h, 24, 2200, 1, "h")}
      {kinetic("binding.association_nM_inv_h_inv", "Association rate", selected.binding.association_nM_inv_h_inv)}
      {kinetic("binding.dissociation_h_inv", "Dissociation rate", selected.binding.dissociation_h_inv)}
      {kinetic("binding.affinity_nM", "Binding affinity (KD)", selected.binding.affinity_nM)}
      {selected.administration.every(event=>event.kind==="infusion") && <><label>Dosing interval (h; blank for one infusion): <input type="number" min={1} value={intervalText}
        onChange={(event) => setIntervalText(event.target.value)} /></label>
      <button type="button" onClick={() => void workspace.applyControl("dosing_interval_h", intervalText.trim() ? Number(intervalText) : null)}>Apply interval</button></> }
    </>}
    <details><summary>Advanced: enter exact values</summary><p>Values apply when you leave the field.</p>
      {selected && <>
        {exact("pk.elimination_half_life_h","Exact half-life",selected.pk.elimination_half_life_h,"h")}
        {exact("binding.association_nM_inv_h_inv","Exact association rate",selected.binding.association_nM_inv_h_inv,"nM^-1 h^-1")}
        {exact("binding.dissociation_h_inv","Exact dissociation rate",selected.binding.dissociation_h_inv,"h^-1")}
        {exact("binding.affinity_nM","Exact KD",selected.binding.affinity_nM,"nM")}
        {exact("exposure_factor","Exact prescribed exposure factor",selected.exposure_factor,"1")}
      </>}
      {exact("duration_h","Exact observation duration",workspace.experiment.duration_h,"h")}
    </details>
    {range("duration_h", "Simulation duration", workspace.experiment.duration_h, 24, 8760, 24, "h")}
    {range("occupancy_threshold", "Analytical threshold", workspace.experiment.occupancy_threshold, .05, .99, .01, "fraction")}
    <button type="button" onClick={() => void workspace.resetToInitial()}>Reset experiment</button>
    <p className="calculation-status" role="status">{workspace.busy ? "Updating curves…" : workspace.error ? "Change could not be applied" : workspace.result ? "Curves up to date" : workspace.status}</p>
    {workspace.lastTransportMs !== null && <details><summary>Calculation timing</summary><p>Last API round trip: {workspace.lastTransportMs.toFixed(0)} ms
      {workspace.lastEditToResultMs !== null && <> · Last edit to result: {workspace.lastEditToResultMs.toFixed(0)} ms</>}</p></details>}
  </section>;
}
