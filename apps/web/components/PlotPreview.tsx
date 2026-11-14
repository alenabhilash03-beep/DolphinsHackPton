"use client";

import type { ExperimentConfig } from "../lib/contracts";
import { useExperimentWorkspace } from "../hooks/useExperimentWorkspace";
import { useSimulationTimeline } from "../hooks/useSimulationTimeline";
import { ScientificPlot } from "./ScientificPlot";
import { TimelineControls } from "./TimelineControls";

/** Isolated functional preview; product styling belongs to the UI contributor. */
export function PlotPreview({ initialExperiment }: { initialExperiment: ExperimentConfig }) {
  const workspace = useExperimentWorkspace(initialExperiment, 600);
  const timeline = useSimulationTimeline(workspace.result);
  return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
    <h1>Hypothesim plot integration preview</h1>
    <p>Conditional mathematical simulation · 90% is an analytical threshold, not a therapeutic cutoff.</p>
    {workspace.error && <p role="alert">{workspace.error}</p>}
    {workspace.result ? <>
      <TimelineControls timeline={timeline} />
      <section aria-label="Concentration comparison">
        <h2>Central concentration</h2>
        <ScientificPlot result={workspace.result} kind="concentration" cursorTimeHours={timeline.timeHours} onSeekTime={timeline.seekTime} />
      </section>
      <section aria-label="Occupancy comparison">
        <h2>Target occupancy</h2>
        <ScientificPlot result={workspace.result} kind="occupancy" cursorTimeHours={timeline.timeHours} onSeekTime={timeline.seekTime} />
      </section>
      <h2>Values at {timeline.timeDays.toFixed(2)} days</h2>
      <ul>{timeline.readout?.scenarios.map((scenario) => <li key={scenario.scenarioId}>
        {scenario.label}: {scenario.centralConcentrationNM.toFixed(3)} nM central; {(scenario.occupancyFraction * 100).toFixed(2)}% occupied
      </li>)}</ul>
    </> : <p role="status">{workspace.status === "loading" ? "Calculating simulation…" : "Simulation not loaded."}</p>}
  </main>;
}
