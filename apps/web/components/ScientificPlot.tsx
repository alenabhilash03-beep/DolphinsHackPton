"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { SimulationResult } from "../lib/contracts";
import { buildScientificPlot, type PlotKind } from "../lib/plot-spec";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export interface ScientificPlotProps {
  result: SimulationResult;
  kind: PlotKind;
  cursorTimeHours: number;
  onSeekTime?: (timeHours: number) => void;
  showTargetSite?: boolean;
  className?: string;
}

/** Styling-free Plotly chart; mount once for concentration and once for occupancy. */
export function ScientificPlot({ result, kind, cursorTimeHours, onSeekTime, showTargetSite, className }: ScientificPlotProps) {
  const spec = useMemo(
    () => buildScientificPlot(result, kind, cursorTimeHours, { showTargetSite }),
    [result, kind, cursorTimeHours, showTargetSite],
  );
  return <div className={className} style={{ minHeight: 320 }}>
    <Plot
      data={spec.data}
      layout={spec.layout}
      config={spec.config}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
      onClick={(event) => {
        const x = event.points[0]?.x;
        if (typeof x === "number") onSeekTime?.(x * 24);
      }}
    />
  </div>;
}
