"use client";

import type { SimulationTimelineController } from "../hooks/useSimulationTimeline";

export interface TimelineControlsProps {
  timeline: SimulationTimelineController;
  className?: string;
}

/** Accessible native controls that the visual UI can style or replace. */
export function TimelineControls({ timeline, className }: TimelineControlsProps) {
  return <div className={className}>
    <button type="button" onClick={timeline.toggle} disabled={timeline.maxIndex === 0}
      aria-label={timeline.playing ? "Pause simulation" : "Play simulation"}>
      {timeline.playing ? "Pause" : "Play"}
    </button>
    <input type="range" min={0} max={timeline.horizonHours} step="any" value={timeline.timeHours}
      onChange={(event) => timeline.seekTime(Number(event.target.value))}
      aria-label="Simulation time" disabled={timeline.horizonHours === 0} />
    <output aria-live="off">{timeline.timeDays.toFixed(2)} days ({timeline.timeHours.toFixed(1)} hours)</output>
  </div>;
}
