"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useExperimentWorkspace } from "../hooks/useExperimentWorkspace.js";
import { useSimulationTimeline } from "../hooks/useSimulationTimeline.js";
import { ScientificPlot } from "./ScientificPlot.jsx";
import { TimelineControls } from "./TimelineControls.jsx";
import { PreviewControls } from "./PreviewControls.jsx";
import { EvidencePanel } from "./EvidencePanel.jsx";
import { ScenarioComparison } from "./ScenarioComparison.jsx";
import { BindingCanvas } from "./BindingCanvas.jsx";
import { VisualizationBoundary } from "./VisualizationBoundary.jsx";
import { PaperSummaries } from "./PaperSummaries.jsx";
import ArticleSummaries from "../../article-summaries.jsx";
const VIEWS = [
    {
        id: "simulation",
        label: "Simulation",
        hint: "Exposure, occupancy & playback"
    },
    {
        id: "evidence",
        label: "Evidence",
        hint: "Papers, citations & model inputs"
    },
    {
        id: "structure",
        label: "Molecular structure",
        hint: "Experimental geometry & contacts"
    },
    {
        id: "details",
        label: "Model details",
        hint: "Full metrics & assumptions"
    }
];
export function PlotPreview({ initialExperiment, initialResult = null, onResultIdChange, onResultChange, editingLocked = false, structure, interpretation, answerShown = false, turn = null }) {
    const [focusPlot, setFocusPlot] = useState(true), [view, setView] = useState("simulation");
    const [structureVisited, setStructureVisited] = useState(false);
    const workspace = useExperimentWorkspace(initialExperiment, 600, initialResult);
    useEffect(()=>onResultIdChange?.(workspace.result?.result_id ?? null), [
        workspace.result?.result_id,
        onResultIdChange
    ]);
    useEffect(()=>onResultChange?.(workspace.result, workspace.selectedScenarioId, workspace.busy), [
        workspace.result,
        workspace.selectedScenarioId,
        workspace.busy,
        onResultChange
    ]);
    const timeline = useSimulationTimeline(workspace.result);
    useEffect(()=>{
        const pause = ()=>timeline.pause();
        window.addEventListener("hypothesim:pause-visuals", pause);
        return ()=>window.removeEventListener("hypothesim:pause-visuals", pause);
    }, [
        timeline.pause
    ]);
    useEffect(()=>{
        const sync = ()=>{
            const hash = window.location.hash;
            if (hash === "#structure") {
                setView("structure");
                setStructureVisited(true);
            } else if (hash === "#paper-evidence") setView("evidence");
            else if (hash === "#model-details") setView("details");
            else if (hash === "#experiment" || hash.startsWith("#plot-")) setView("simulation");
            else return;
            // Reveal the target before native anchor scrolling completes.
            requestAnimationFrame(()=>document.getElementById(hash.slice(1))?.scrollIntoView({
                    block: "start"
                }));
        };
        sync();
        window.addEventListener("hashchange", sync);
        return ()=>window.removeEventListener("hashchange", sync);
    }, []);
    function selectView(next) {
        setView(next);
        if (next === "structure") setStructureVisited(true);
        window.history.replaceState(null, "", next === "structure" ? "#structure" : next === "evidence" ? "#paper-evidence" : next === "details" ? "#model-details" : "#experiment");
    }
    useEffect(()=>{
        if (view !== "simulation") timeline.pause();
    }, [
        view,
        timeline.pause
    ]);
    useEffect(()=>{
        const select = (event)=>workspace.selectAlternative(event.detail);
        window.addEventListener("hypothesim:select-scenario", select);
        return ()=>window.removeEventListener("hypothesim:select-scenario", select);
    }, [
        workspace.experiment
    ]);
    const currentInterpretation = interpretation?.result_id === workspace.result?.result_id ? interpretation : null;
    return /*#__PURE__*/ _jsxs("section", {
        id: "experiment",
        className: "experiment-panel visual-experiment-panel",
        children: [
            /*#__PURE__*/ _jsx("div", {
                className: "workspace-viewbar",
                role: "tablist",
                "aria-label": "Experiment views",
                children: VIEWS.map((item)=>/*#__PURE__*/ _jsx("button", {
                        id: `tab-${item.id}`,
                        role: "tab",
                        "aria-selected": view === item.id,
                        "aria-controls": `view-${item.id}`,
                        tabIndex: view === item.id ? 0 : -1,
                        onKeyDown: (event)=>{
                            if ([
                                'ArrowLeft',
                                'ArrowRight',
                                'Home',
                                'End'
                            ].includes(event.key)) {
                                event.preventDefault();
                                const index = VIEWS.findIndex((v)=>v.id === view), next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length;
                                selectView(VIEWS[next].id);
                                document.getElementById(`tab-${VIEWS[next].id}`)?.focus();
                            }
                        },
                        onClick: ()=>selectView(item.id),
                        children: item.label
                    }, item.id))
            }),
            workspace.error && /*#__PURE__*/ _jsx("p", {
                role: "alert",
                children: workspace.error
            }),
            /*#__PURE__*/ _jsxs("div", {
                id: "view-simulation",
                role: "tabpanel",
                "aria-labelledby": "tab-simulation",
                hidden: view !== 'simulation',
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "simulation-heading",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("h2", {
                                        children: "Exposure and binding"
                                    }),
                                    /*#__PURE__*/ _jsx("p", {
                                        children: workspace.busy ? 'Recalculating · the last accepted curves remain visible.' : ''
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "quiet-button",
                                "aria-controls": "experiment-conditions",
                                "aria-expanded": !focusPlot,
                                onClick: ()=>setFocusPlot((value)=>!value),
                                children: focusPlot ? 'Show conditions' : 'Hide conditions'
                            })
                        ]
                    }),
                    workspace.result ? /*#__PURE__*/ _jsxs(_Fragment, {
                        children: [
                            /*#__PURE__*/ _jsx(TimelineControls, {
                                timeline: timeline
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "plots-with-articles",
                                children: [
                                    /*#__PURE__*/ _jsxs("section", {
                                        id: "plot-occupancy",
                                        className: "chart-card occupancy-hero",
                                        "aria-label": "Occupancy comparison",
                                        children: [
                                            /*#__PURE__*/ _jsx("div", {
                                                className: "chart-heading",
                                                children: /*#__PURE__*/ _jsx("h3", {
                                                    children: "Target occupancy"
                                                })
                                            }),
                                            /*#__PURE__*/ _jsx(VisualizationBoundary, {
                                                label: "Target occupancy plot",
                                                children: /*#__PURE__*/ _jsx(ScientificPlot, {
                                                    result: workspace.result,
                                                    kind: "occupancy",
                                                    cursorTimeHours: timeline.timeHours,
                                                    revealProgress: timeline.revealCurves,
                                                    onSeekTime: timeline.seekTime
                                                })
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx(ArticleSummaries, {
                                        turn: turn,
                                        interpretation: currentInterpretation,
                                        experiment: workspace.experiment
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "secondary-visuals",
                                children: [
                                    /*#__PURE__*/ _jsxs("section", {
                                        id: "plot-concentration",
                                        className: "chart-card",
                                        "aria-label": "Concentration comparison",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "chart-heading",
                                                children: [
                                                    /*#__PURE__*/ _jsx("h3", {
                                                        children: "Drug concentration"
                                                    }),
                                                    /*#__PURE__*/ _jsx("span", {
                                                        children: "Central exposure · nM"
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx(VisualizationBoundary, {
                                                label: "Concentration plot",
                                                children: /*#__PURE__*/ _jsx(ScientificPlot, {
                                                    result: workspace.result,
                                                    kind: "concentration",
                                                    cursorTimeHours: timeline.timeHours,
                                                    revealProgress: timeline.revealCurves,
                                                    onSeekTime: timeline.seekTime
                                                })
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx(VisualizationBoundary, {
                                        label: "Binding schematic",
                                        children: /*#__PURE__*/ _jsx(BindingCanvas, {
                                            result: workspace.result,
                                            index: timeline.index,
                                            scenarioId: workspace.selectedScenarioId,
                                            visualTimeHours: timeline.timeHours
                                        })
                                    })
                                ]
                            })
                        ]
                    }) : /*#__PURE__*/ _jsx("p", {
                        role: "status",
                        children: "Preparing the accepted simulation…"
                    }),
                    /*#__PURE__*/ _jsx("aside", {
                        id: "experiment-conditions",
                        className: "controls-panel",
                        hidden: focusPlot,
                        children: /*#__PURE__*/ _jsx("fieldset", {
                            disabled: editingLocked,
                            children: /*#__PURE__*/ _jsx(PreviewControls, {
                                workspace: workspace
                            })
                        })
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "science-scope",
                        children: "Exploratory model · target engagement does not establish efficacy."
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                id: "view-structure",
                role: "tabpanel",
                "aria-labelledby": "tab-structure",
                hidden: view !== 'structure',
                children: structureVisited && (structure ?? /*#__PURE__*/ _jsx("p", {
                    children: "No verified structure is configured for this system."
                }))
            }),
            /*#__PURE__*/ _jsxs("div", {
                id: "view-evidence",
                role: "tabpanel",
                "aria-labelledby": "tab-evidence",
                hidden: view !== 'evidence',
                children: [
                    currentInterpretation && (!answerShown || !!currentInterpretation.paper_summaries?.length) && /*#__PURE__*/ _jsxs("section", {
                        className: "agent-findings",
                        children: [
                            /*#__PURE__*/ _jsx("h2", {
                                children: answerShown ? 'Sources of the simulation inputs' : 'Research interpretation'
                            }),
                            !answerShown && /*#__PURE__*/ _jsx("ul", {
                                children: currentInterpretation.claims.map((claim)=>/*#__PURE__*/ _jsx("li", {
                                        children: claim
                                    }, claim))
                            }),
                            !!currentInterpretation.paper_summaries?.length && /*#__PURE__*/ _jsx(PaperSummaries, {
                                summaries: currentInterpretation.paper_summaries,
                                experiment: workspace.experiment
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx(EvidencePanel, {
                        experiment: workspace.experiment,
                        scenarioId: workspace.selectedScenarioId,
                        resultPresent: !!workspace.result,
                        showSummaries: !currentInterpretation?.paper_summaries?.length
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                id: "view-details",
                role: "tabpanel",
                "aria-labelledby": "tab-details",
                hidden: view !== 'details',
                children: workspace.result && /*#__PURE__*/ _jsx(ScenarioComparison, {
                    result: workspace.result,
                    busy: workspace.busy
                })
            }),
            /*#__PURE__*/ _jsxs("details", {
                className: "result-record",
                children: [
                    /*#__PURE__*/ _jsx("summary", {
                        children: "Result provenance and identifiers"
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        children: [
                            workspace.result?.result_id ?? 'Pending',
                            " · ",
                            workspace.experiment.drug,
                            " → ",
                            workspace.experiment.target
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        children: "All curves and metrics use the accepted scientific service result."
                    })
                ]
            })
        ]
    });
}
