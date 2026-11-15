"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { KINETIC_RANGES, fromLogPosition, toLogPosition } from "../lib/log-control.js";
/** Native technical controls for checking the data path; the UI team owns presentation. */ export function PreviewControls({ workspace }) {
    const selected = workspace.experiment.scenarios.find((scenario)=>scenario.scenario_id === workspace.selectedScenarioId);
    const [drafts, setDrafts] = useState({});
    const [intervalText, setIntervalText] = useState("");
    useEffect(()=>{
        setDrafts({});
        setIntervalText(selected?.dosing_interval_h?.toString() ?? "");
    }, [
        workspace.experiment,
        workspace.selectedScenarioId,
        selected?.dosing_interval_h
    ]);
    const valueFor = (field, actual)=>drafts[field] ?? actual;
    const edit = (field, value)=>{
        setDrafts((current)=>({
                ...current,
                [field]: value
            }));
        void workspace.applyControl(field, value);
    };
    const range = (field, label, actual, min, max, step, unit)=>/*#__PURE__*/ _jsxs("label", {
            style: {
                display: "block",
                margin: "8px 0"
            },
            children: [
                label,
                ": ",
                /*#__PURE__*/ _jsxs("output", {
                    children: [
                        valueFor(field, actual).toFixed(step < 1 ? 2 : 0),
                        " ",
                        unit
                    ]
                }),
                /*#__PURE__*/ _jsx("input", {
                    "aria-label": label,
                    type: "range",
                    min: min,
                    max: max,
                    step: step,
                    value: valueFor(field, actual),
                    onChange: (event)=>edit(field, Number(event.target.value)),
                    style: {
                        display: "block",
                        width: "100%"
                    }
                })
            ]
        });
    const kinetic = (field, label, actual)=>{
        const bounds = KINETIC_RANGES[field];
        const shown = valueFor(field, actual);
        return /*#__PURE__*/ _jsxs("label", {
            style: {
                display: "block",
                margin: "8px 0"
            },
            children: [
                label,
                ": ",
                /*#__PURE__*/ _jsxs("output", {
                    children: [
                        shown.toExponential(3),
                        " ",
                        bounds.unit
                    ]
                }),
                /*#__PURE__*/ _jsx("input", {
                    "aria-label": label,
                    type: "range",
                    min: 0,
                    max: 1,
                    step: 0.001,
                    value: toLogPosition(shown, bounds.min, bounds.max),
                    onChange: (event)=>edit(field, fromLogPosition(Number(event.target.value), bounds.min, bounds.max)),
                    style: {
                        display: "block",
                        width: "100%"
                    }
                })
            ]
        });
    };
    const exact = (field, label, actual, unit)=>/*#__PURE__*/ _jsxs("label", {
            style: {
                display: "block",
                margin: "8px 0"
            },
            children: [
                label,
                " (",
                unit,
                ")",
                /*#__PURE__*/ _jsx("input", {
                    type: "number",
                    step: "any",
                    defaultValue: actual,
                    onBlur: (event)=>{
                        if (event.currentTarget.value.trim()) {
                            const next = Number(event.currentTarget.value);
                            if (Number.isFinite(next) && next !== actual) edit(field, next);
                        }
                    }
                }, `${selected?.scenario_id ?? "global"}:${field}:${actual}`)
            ]
        });
    return /*#__PURE__*/ _jsxs("section", {
        "aria-label": "Experiment parameter controls",
        children: [
            /*#__PURE__*/ _jsx("h3", {
                children: "Adjust conditions"
            }),
            /*#__PURE__*/ _jsx("p", {
                children: "Select an alternative, then move a slider to recalculate the curves. The baseline stays fixed."
            }),
            /*#__PURE__*/ _jsxs("label", {
                children: [
                    "Editing alternative",
                    /*#__PURE__*/ _jsx("select", {
                        value: workspace.selectedScenarioId ?? "",
                        onChange: (event)=>workspace.selectAlternative(event.target.value),
                        children: workspace.alternatives.map((scenario)=>/*#__PURE__*/ _jsx("option", {
                                value: scenario.scenario_id,
                                children: scenario.label
                            }, scenario.scenario_id))
                    })
                ]
            }),
            !workspace.alternatives.length && /*#__PURE__*/ _jsx("p", {
                children: "Only a protected baseline is prepared. Use “Compare twofold and fivefold affinity improvement at fixed association rate” above to create editable alternatives."
            }),
            selected && /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsx("p", {
                        className: "parameter-hint",
                        children: "Lower KD means stronger affinity. Changing KD adjusts dissociation while keeping association fixed."
                    }),
                    selected.administration.every((event)=>event.kind === "infusion") ? range("dose_mg", "Infusion amount", selected.administration[0].amount_mg, 0, Math.max(1500, selected.administration[0].amount_mg * 2), 1, "mg") : /*#__PURE__*/ _jsx("p", {
                        children: "Dose and repeat-interval controls support finite infusions only. Kinetic and observation-window controls remain available."
                    }),
                    range("pk.elimination_half_life_h", "Effective half-life", selected.pk.elimination_half_life_h, 24, 2200, 1, "h"),
                    kinetic("binding.association_nM_inv_h_inv", "Association rate", selected.binding.association_nM_inv_h_inv),
                    kinetic("binding.dissociation_h_inv", "Dissociation rate", selected.binding.dissociation_h_inv),
                    kinetic("binding.affinity_nM", "Binding affinity (KD)", selected.binding.affinity_nM),
                    selected.administration.every((event)=>event.kind === "infusion") && /*#__PURE__*/ _jsxs(_Fragment, {
                        children: [
                            /*#__PURE__*/ _jsxs("label", {
                                children: [
                                    "Dosing interval (h; blank for one infusion): ",
                                    /*#__PURE__*/ _jsx("input", {
                                        type: "number",
                                        min: 1,
                                        value: intervalText,
                                        onChange: (event)=>setIntervalText(event.target.value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                onClick: ()=>void workspace.applyControl("dosing_interval_h", intervalText.trim() ? Number(intervalText) : null),
                                children: "Apply interval"
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("details", {
                children: [
                    /*#__PURE__*/ _jsx("summary", {
                        children: "Advanced: enter exact values"
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        children: "Values apply when you leave the field."
                    }),
                    selected && /*#__PURE__*/ _jsxs(_Fragment, {
                        children: [
                            exact("pk.elimination_half_life_h", "Exact half-life", selected.pk.elimination_half_life_h, "h"),
                            exact("binding.association_nM_inv_h_inv", "Exact association rate", selected.binding.association_nM_inv_h_inv, "nM^-1 h^-1"),
                            exact("binding.dissociation_h_inv", "Exact dissociation rate", selected.binding.dissociation_h_inv, "h^-1"),
                            exact("binding.affinity_nM", "Exact KD", selected.binding.affinity_nM, "nM"),
                            exact("exposure_factor", "Exact prescribed exposure factor", selected.exposure_factor, "1")
                        ]
                    }),
                    exact("duration_h", "Exact observation duration", workspace.experiment.duration_h, "h")
                ]
            }),
            range("duration_h", "Simulation duration", workspace.experiment.duration_h, 24, 8760, 24, "h"),
            range("occupancy_threshold", "Analytical threshold", workspace.experiment.occupancy_threshold, .05, .99, .01, "fraction"),
            /*#__PURE__*/ _jsx("button", {
                type: "button",
                onClick: ()=>void workspace.resetToInitial(),
                children: "Reset experiment"
            }),
            /*#__PURE__*/ _jsx("p", {
                className: "calculation-status",
                role: "status",
                children: workspace.busy ? "Updating curves…" : workspace.error ? "Change could not be applied" : workspace.result ? "Curves up to date" : workspace.status
            }),
            workspace.lastTransportMs !== null && /*#__PURE__*/ _jsxs("details", {
                children: [
                    /*#__PURE__*/ _jsx("summary", {
                        children: "Calculation timing"
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        children: [
                            "Last API round trip: ",
                            workspace.lastTransportMs.toFixed(0),
                            " ms",
                            workspace.lastEditToResultMs !== null && /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    " · Last edit to result: ",
                                    workspace.lastEditToResultMs.toFixed(0),
                                    " ms"
                                ]
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
