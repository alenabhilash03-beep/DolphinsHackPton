"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { CONCENTRATION_SCALE_NM, schematicState, TARGET_SITES } from "../lib/binding-schematic.js";
/** Population schematic sampled from the plots' timeline, with no independent clock. */ export function BindingCanvas({ result, index, scenarioId, visualTimeHours }) {
    const canvas = useRef(null);
    const [width, setWidth] = useState(700);
    const [reduced, setReduced] = useState(false);
    const [viewScenario, setViewScenario] = useState(null);
    const state = schematicState(result, index, viewScenario ?? scenarioId);
    useEffect(()=>{
        const query = matchMedia("(prefers-reduced-motion: reduce)");
        const update = ()=>setReduced(query.matches);
        update();
        query.addEventListener("change", update);
        const observer = new ResizeObserver((entries)=>setWidth(Math.round(entries[0].contentRect.width)));
        if (canvas.current) observer.observe(canvas.current);
        return ()=>{
            query.removeEventListener("change", update);
            observer.disconnect();
        };
    }, []);
    useEffect(()=>{
        const element = canvas.current;
        const ctx = element?.getContext("2d");
        if (!element || !ctx || width < 1) return;
        const height = 260;
        const ratio = Math.min(devicePixelRatio || 1, 2);
        if (element.width !== Math.round(width * ratio) || element.height !== height * ratio) {
            element.width = Math.round(width * ratio);
            element.height = height * ratio;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "#302b27");
        gradient.addColorStop(1, "#39322e");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        const phase = reduced ? 0 : (visualTimeHours ?? state.timeHours) / result.configuration.duration_h * 24;
        for(let i = 0; i < state.freeParticles; i++){
            const x = (i * 137.7 + phase * (17 + i % 11)) % width;
            const y = 46 + i * 53.1 % 105 + Math.sin(phase + i) * 15;
            ctx.fillStyle = "#c6a67f";
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "#596852";
        ctx.fillRect(0, 220, width, 40);
        ctx.strokeStyle = "#9eae96";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 220);
        ctx.lineTo(width, 220);
        ctx.stroke();
        for(let i = 0; i < TARGET_SITES; i++){
            const x = (i + .5) * width / TARGET_SITES;
            const occupied = i * 17 % TARGET_SITES < state.occupiedSites;
            ctx.strokeStyle = occupied ? "#c6a67f" : "#b2c5a7";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 220);
            ctx.lineTo(x, 199);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, 195, 4, 0, Math.PI);
            ctx.stroke();
            if (occupied) {
                ctx.fillStyle = "#c6a67f";
                ctx.beginPath();
                ctx.arc(x, 191, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.fillStyle = "#efe9e1";
        ctx.font = "12px sans-serif";
        ctx.fillText("Drug population · gold", 12, 24);
        ctx.fillText("Effective target sites · sage", 12, 245);
    }, [
        width,
        reduced,
        result.configuration.duration_h,
        state.timeHours,
        visualTimeHours,
        state.freeParticles,
        state.occupiedSites
    ]);
    return /*#__PURE__*/ _jsxs("section", {
        "aria-label": "Model-driven binding schematic",
        className: "binding-panel",
        children: [
            /*#__PURE__*/ _jsx("p", {
                className: "eyebrow",
                children: "MODEL-DRIVEN SCHEMATIC"
            }),
            /*#__PURE__*/ _jsx("h2", {
                children: "Watch the binding population"
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    state.label,
                    " · ",
                    (state.timeHours / 24).toFixed(2),
                    " days."
                ]
            }),
            /*#__PURE__*/ _jsxs("label", {
                children: [
                    "Visualize scenario ",
                    /*#__PURE__*/ _jsx("select", {
                        value: viewScenario ?? scenarioId ?? result.scenarios[0].scenario_id,
                        onChange: (event)=>setViewScenario(event.target.value),
                        children: result.configuration.scenarios.map((scenario)=>/*#__PURE__*/ _jsx("option", {
                                value: scenario.scenario_id,
                                children: scenario.label
                            }, scenario.scenario_id))
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "live-readouts",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                children: "Prescribed site exposure"
                            }),
                            /*#__PURE__*/ _jsxs("strong", {
                                children: [
                                    state.concentration.toPrecision(4),
                                    " nM"
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                children: "Model occupancy"
                            }),
                            /*#__PURE__*/ _jsxs("strong", {
                                children: [
                                    (state.occupancy * 100).toFixed(2),
                                    "%"
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                children: "Illustrative occupied targets"
                            }),
                            /*#__PURE__*/ _jsxs("strong", {
                                children: [
                                    state.occupiedSites,
                                    " / ",
                                    TARGET_SITES
                                ]
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("canvas", {
                ref: canvas,
                "aria-label": "Schematic drug and target populations",
                style: {
                    width: "100%",
                    height: 260,
                    borderRadius: 12
                }
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    "Play or scrub the shared timeline to animate. Free-particle scale: 0–",
                    CONCENTRATION_SCALE_NM,
                    " nM",
                    state.clipped ? " (display capped)" : "",
                    "; target states are rounded to ",
                    TARGET_SITES,
                    " sites. Positions illustrate population changes, not tracked molecules or atomistic motion.",
                    reduced && " Reduced-motion preference is active."
                ]
            })
        ]
    });
}
