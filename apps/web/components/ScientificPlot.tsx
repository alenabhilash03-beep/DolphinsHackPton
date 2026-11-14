"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { PlotlyHTMLElement } from "plotly.js";
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

/** Plotly draws scientific curves; a lightweight overlay tracks playback time. */
export function ScientificPlot({ result, kind, cursorTimeHours, onSeekTime, showTargetSite, className }: ScientificPlotProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<PlotlyHTMLElement | null>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(cursorTimeHours);
  timeRef.current = cursorTimeHours;
  const horizonDays = result.configuration.duration_h / 24;
  const spec = useMemo(
    () => buildScientificPlot(result, kind, 0, { showTargetSite, cursor: false }),
    [result, kind, showTargetSite],
  );

  const positionCursor = useCallback(() => {
    const shell = shellRef.current;
    const graph = graphRef.current;
    const line = lineRef.current;
    const plotArea = graph?.querySelector(".nsewdrag");
    if (!shell || !graph || !line || !plotArea) return;
    const axis = (graph as PlotlyHTMLElement & { _fullLayout?: { xaxis?: { range?: [number, number] } } })._fullLayout?.xaxis;
    const [min, max] = axis?.range ?? [0, horizonDays];
    const day = timeRef.current / 24;
    if (!(max > min) || day < min || day > max) {
      line.style.display = "none";
      return;
    }
    const shellRect = shell.getBoundingClientRect();
    const plotRect = plotArea.getBoundingClientRect();
    line.style.display = "block";
    line.style.left = `${plotRect.left - shellRect.left + (day - min) / (max - min) * plotRect.width}px`;
    line.style.top = `${plotRect.top - shellRect.top}px`;
    line.style.height = `${plotRect.height}px`;
  }, [horizonDays]);

  useEffect(() => { positionCursor(); }, [cursorTimeHours, positionCursor]);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(() => requestAnimationFrame(positionCursor));
    observer.observe(shell);
    return () => observer.disconnect();
  }, [positionCursor]);

  return <div ref={shellRef} className={className} style={{ minHeight: 320, position: "relative" }}>
    <Plot
      data={spec.data}
      layout={spec.layout}
      config={spec.config}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
      onInitialized={(_, graph) => { graphRef.current = graph as PlotlyHTMLElement; requestAnimationFrame(positionCursor); }}
      onUpdate={(_, graph) => { graphRef.current = graph as PlotlyHTMLElement; requestAnimationFrame(positionCursor); }}
      onRelayout={() => requestAnimationFrame(positionCursor)}
      onPurge={() => { graphRef.current = null; }}
      onClick={(event) => {
        const x = event.points[0]?.x;
        if (typeof x === "number") onSeekTime?.(x * 24);
      }}
    />
    <div ref={lineRef} aria-hidden="true" style={{ display: "none", position: "absolute", width: 0, borderLeft: "2px dashed #2d3748", pointerEvents: "none" }} />
  </div>;
}
