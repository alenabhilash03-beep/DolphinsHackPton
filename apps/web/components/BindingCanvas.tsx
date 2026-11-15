"use client";
import { useEffect, useRef, useState } from "react";
import type { SimulationResult } from "../lib/contracts";
import { CONCENTRATION_SCALE_NM, schematicState, TARGET_SITES } from "../lib/binding-schematic";

/** Population schematic sampled from the plots' timeline, with no independent clock. */
export function BindingCanvas({ result, index, scenarioId }: { result: SimulationResult; index: number; scenarioId: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(700);
  const [reduced, setReduced] = useState(false);
  const [viewScenario, setViewScenario] = useState<string | null>(null);
  const state = schematicState(result, index, viewScenario ?? scenarioId);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    if (canvas.current) observer.observe(canvas.current);
    return () => { query.removeEventListener("change", update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx || width < 1) return;
    const height = 260;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (element.width !== Math.round(width * ratio) || element.height !== height * ratio) {
      element.width = Math.round(width * ratio); element.height = height * ratio;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#143747"); gradient.addColorStop(1, "#254e4c");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const phase = reduced ? 0 : state.timeHours / result.configuration.duration_h * 24;
    for (let i = 0; i < state.freeParticles; i++) {
      const x = (i * 137.7 + phase * (17 + i % 11)) % width;
      const y = 46 + ((i * 53.1) % 105) + Math.sin(phase + i) * 15;
      ctx.fillStyle = "#f0be7a"; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#2f6b65"; ctx.fillRect(0, 220, width, 40);
    ctx.strokeStyle = "#62aaa0"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 220); ctx.lineTo(width, 220); ctx.stroke();
    for (let i = 0; i < TARGET_SITES; i++) {
      const x = (i + .5) * width / TARGET_SITES;
      const occupied = (i * 17) % TARGET_SITES < state.occupiedSites;
      ctx.strokeStyle = occupied ? "#f0be7a" : "#86d1c4";
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 220); ctx.lineTo(x, 199); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, 195, 4, 0, Math.PI); ctx.stroke();
      if (occupied) { ctx.fillStyle = "#f0be7a"; ctx.beginPath(); ctx.arc(x, 191, 4, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = "#dfede7"; ctx.font = "12px sans-serif";
    ctx.fillText("Drug molecules (free)", 12, 24);
    ctx.fillText("Target sites", 12, 245);
  }, [width, reduced, result.configuration.duration_h, state.timeHours, state.freeParticles, state.occupiedSites]);
  return <section aria-label="Model-driven binding schematic" className="binding-panel">
    <p className="eyebrow">MODEL-DRIVEN SCHEMATIC</p><h2>Watch the binding population</h2>
    <p>{state.label} · {(state.timeHours / 24).toFixed(2)} days.</p>
    <label>Visualize scenario <select value={viewScenario ?? scenarioId ?? result.scenarios[0].scenario_id} onChange={(event) => setViewScenario(event.target.value)}>
      {result.configuration.scenarios.map((scenario) => <option key={scenario.scenario_id} value={scenario.scenario_id}>{scenario.label}</option>)}
    </select></label>
    <div className="live-readouts"><div><span>Prescribed site exposure</span><strong>{state.concentration.toPrecision(4)} nM</strong></div>
      <div><span>Model occupancy</span><strong>{(state.occupancy * 100).toFixed(2)}%</strong></div>
      <div><span>Illustrative occupied targets</span><strong>{state.occupiedSites} / {TARGET_SITES}</strong></div></div>
    <canvas ref={canvas} aria-label="Schematic drug and target populations" style={{ width: "100%", height: 260, borderRadius: 12 }} />
    <p>Play or scrub the shared timeline to animate. Free-particle scale: 0–{CONCENTRATION_SCALE_NM} nM{state.clipped ? " (display capped)" : ""}; target states are rounded to {TARGET_SITES} sites. Positions illustrate population changes, not tracked molecules or atomistic motion.{reduced && " Reduced-motion preference is active."}</p>
  </section>;
}
