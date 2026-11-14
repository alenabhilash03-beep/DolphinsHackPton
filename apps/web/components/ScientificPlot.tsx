"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { PlotlyHTMLElement } from "plotly.js";
import type { SimulationResult } from "../lib/contracts";
import { buildScientificPlot, scenarioColor, type PlotKind } from "../lib/plot-spec";
import { nearestTimeIndex } from "../lib/timeline";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export interface ScientificPlotProps {
  result: SimulationResult;
  kind: PlotKind;
  cursorTimeHours: number;
  onSeekTime?: (timeHours: number) => void;
  showTargetSite?: boolean;
  className?: string;
  revealProgress?: boolean;
}

/** Plotly draws scientific curves; a lightweight overlay tracks playback time. */
export function ScientificPlot({ result, kind, cursorTimeHours, onSeekTime, showTargetSite, className, revealProgress = false }: ScientificPlotProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<PlotlyHTMLElement | null>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const timeLabel = useRef<HTMLDivElement>(null);
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
    const layout = (graph as PlotlyHTMLElement & { _fullLayout?: { xaxis?: { range?: [number, number] }; yaxis?: { range?: [number, number] } } })._fullLayout;
    const axis = layout?.xaxis;
    const [min, max] = axis?.range ?? [0, horizonDays];
    const day = timeRef.current / 24;
    if (!(max > min) || day < min || day > max) {
      line.style.display = "none";
      if (shadeRef.current) shadeRef.current.style.display = "none";
      if (timeLabel.current) timeLabel.current.style.display = "none";
      markerRefs.current.forEach((marker) => { if (marker) marker.style.display = "none"; });
      return;
    }
    const shellRect = shell.getBoundingClientRect();
    const plotRect = plotArea.getBoundingClientRect();
    line.style.display = "block";
    line.style.left = `${plotRect.left - shellRect.left + (day - min) / (max - min) * plotRect.width}px`;
    line.style.top = `${plotRect.top - shellRect.top}px`;
    line.style.height = `${plotRect.height}px`;
    const cursorX = plotRect.left - shellRect.left + (day - min) / (max - min) * plotRect.width;
    if (shadeRef.current) Object.assign(shadeRef.current.style, {
      display: revealProgress ? "block" : "none", left: `${cursorX}px`, top: `${plotRect.top - shellRect.top}px`,
      width: `${Math.max(0, plotRect.right - shellRect.left - cursorX)}px`, height: `${plotRect.height}px`,
    });
    if (timeLabel.current) {
      timeLabel.current.textContent = `Day ${day.toFixed(1)}`;
      Object.assign(timeLabel.current.style, { display: "block", left: `${Math.min(cursorX, plotRect.right - shellRect.left - 65)}px`, top: `${Math.max(0, plotRect.top - shellRect.top - 24)}px` });
    }
    const [yMin, yMax] = layout?.yaxis?.range ?? [0, 100];
    const index = nearestTimeIndex(result.time_h, timeRef.current);
    result.scenarios.forEach((series, i) => {
      const marker = markerRefs.current[i];
      if (!marker) return;
      const value = kind === "occupancy" ? series.occupancy[index] * 100 : series.central_concentration_nM[index];
      Object.assign(marker.style, { display: value >= yMin && value <= yMax && yMax > yMin ? "block" : "none",
        left: `${cursorX}px`, top: `${plotRect.top - shellRect.top + (1 - (value - yMin) / (yMax - yMin)) * plotRect.height}px` });
    });
  }, [horizonDays, result, kind, revealProgress]);

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
    <div ref={shadeRef} aria-hidden="true" style={{ display: "none", position: "absolute", background: "rgba(255,253,250,.97)", pointerEvents: "none", zIndex: 1 }} />
    <div ref={lineRef} aria-hidden="true" style={{ display: "none", position: "absolute", width: 0, borderLeft: "2px dashed #72383D", pointerEvents: "none", zIndex: 2 }} />
    <div ref={timeLabel} className="plot-time-label" aria-hidden="true" />
    {result.scenarios.map((series, i) => <div key={series.scenario_id} ref={(element) => { markerRefs.current[i] = element; }} aria-hidden="true"
      style={{ display: "none", position: "absolute", width: 11, height: 11, borderRadius: "50%", border: "2px solid white", background: scenarioColor(series.scenario_id, i), transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 3, boxShadow: "0 0 0 2px #ffffff60" }} />)}
  </div>;
}
