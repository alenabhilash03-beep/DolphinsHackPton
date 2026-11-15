"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { changedParameters, investigationView, parameterLabel, scientificNumber, stageSummary, stateLabel, toolLabel } from "../lib/investigation.js";
import { measurementCards } from "../lib/synthesis-view.js";
import { MeasurementCards } from "./ScientificAnswer.jsx";
function ParameterTable({ rows, config, experimentId }) {
    return /*#__PURE__*/ _jsx("div", {
        className: "investigation-table-scroll",
        children: /*#__PURE__*/ _jsxs("table", {
            children: [
                /*#__PURE__*/ _jsx("caption", {
                    children: "Actual configured values · canonical units"
                }),
                /*#__PURE__*/ _jsx("thead", {
                    children: /*#__PURE__*/ _jsxs("tr", {
                        children: [
                            /*#__PURE__*/ _jsx("th", {
                                children: "Parameter / scenario"
                            }),
                            /*#__PURE__*/ _jsx("th", {
                                children: "Configured"
                            }),
                            /*#__PURE__*/ _jsx("th", {
                                children: "Reference → change"
                            }),
                            /*#__PURE__*/ _jsx("th", {
                                children: "Provenance"
                            })
                        ]
                    })
                }),
                /*#__PURE__*/ _jsx("tbody", {
                    children: rows.map((p, index)=>/*#__PURE__*/ _jsxs("tr", {
                            children: [
                                /*#__PURE__*/ _jsxs("th", {
                                    scope: "row",
                                    children: [
                                        parameterLabel(p.parameter),
                                        /*#__PURE__*/ _jsx("small", {
                                            children: p.scenario_id ? (config.experiment_id === experimentId ? config.scenarios.find((s)=>s.scenario_id === p.scenario_id)?.label : null) ?? p.scenario_id : "Common design"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("td", {
                                    children: [
                                        scientificNumber(p.value),
                                        " ",
                                        /*#__PURE__*/ _jsx("span", {
                                            children: p.unit
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("td", {
                                    children: p.comparison === "none" ? "Not compared" : /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            scientificNumber(p.reference_value),
                                            " → ",
                                            p.change === "unchanged" ? "unchanged" : p.delta != null ? `${p.delta > 0 ? "+" : ""}${scientificNumber(p.delta)} ${p.unit}` : "added / changed",
                                            /*#__PURE__*/ _jsx("small", {
                                                children: p.comparison === "baseline" ? "vs protected baseline" : "vs previous result"
                                            })
                                        ]
                                    })
                                }),
                                /*#__PURE__*/ _jsxs("td", {
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "parameter-provenance",
                                            children: p.provenance.replaceAll("_", " ")
                                        }),
                                        /*#__PURE__*/ _jsxs("small", {
                                            children: [
                                                p.review_status.replaceAll("_", " "),
                                                p.source_ids?.length ? ` · ${p.source_ids.join(", ")}` : "",
                                                p.source_ids_truncated ? " · more citations in evidence" : ""
                                            ]
                                        })
                                    ]
                                })
                            ]
                        }, `${p.scenario_id}:${p.parameter}:${index}`))
                })
            ]
        })
    });
}
function ConfigurationDetails({ snapshot, config }) {
    const changed = changedParameters(snapshot);
    return /*#__PURE__*/ _jsxs("section", {
        className: "execution-configuration",
        "aria-label": "Agent configured parameters",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "execution-section-heading",
                children: [
                    /*#__PURE__*/ _jsx("h3", {
                        children: "Configured experiment"
                    }),
                    /*#__PURE__*/ _jsxs("span", {
                        children: [
                            snapshot.schedules.length,
                            " scenario",
                            snapshot.schedules.length === 1 ? "" : "s",
                            " · ",
                            scientificNumber(snapshot.duration_h / 24),
                            " days"
                        ]
                    })
                ]
            }),
            changed.length ? /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsxs("p", {
                        children: [
                            changed.length,
                            " parameter changes against the stated reference. Linked values are included."
                        ]
                    }),
                    /*#__PURE__*/ _jsx(ParameterTable, {
                        rows: changed.slice(0, 6),
                        config: config,
                        experimentId: snapshot.experiment_id
                    }),
                    changed.length > 6 && /*#__PURE__*/ _jsxs("details", {
                        children: [
                            /*#__PURE__*/ _jsxs("summary", {
                                children: [
                                    changed.length - 6,
                                    " more parameter changes"
                                ]
                            }),
                            /*#__PURE__*/ _jsx(ParameterTable, {
                                rows: changed.slice(6),
                                config: config,
                                experimentId: snapshot.experiment_id
                            })
                        ]
                    })
                ]
            }) : /*#__PURE__*/ _jsx("p", {
                children: "The configured values are recorded below. No comparison changes were reported."
            }),
            /*#__PURE__*/ _jsxs("details", {
                children: [
                    /*#__PURE__*/ _jsx("summary", {
                        children: "All parameter values, provenance & dose schedules"
                    }),
                    /*#__PURE__*/ _jsx(ParameterTable, {
                        rows: snapshot.parameters,
                        config: config,
                        experimentId: snapshot.experiment_id
                    }),
                    snapshot.schedules.map((s)=>/*#__PURE__*/ _jsxs("section", {
                            className: "execution-schedule",
                            children: [
                                /*#__PURE__*/ _jsx("h4", {
                                    children: (config.experiment_id === snapshot.experiment_id ? config.scenarios.find((item)=>item.scenario_id === s.scenario_id)?.label : null) ?? s.scenario_id
                                }),
                                /*#__PURE__*/ _jsxs("p", {
                                    children: [
                                        s.intervention === "baseline" ? "Protected baseline" : "Alternative",
                                        " · ",
                                        s.administration.length,
                                        " administration event(s)",
                                        s.changed === false ? " · schedule unchanged" : s.changed ? " · schedule changed" : ""
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("ol", {
                                    children: s.administration.map((event, index)=>/*#__PURE__*/ _jsxs("li", {
                                            children: [
                                                event.kind === "infusion" ? "Infusion" : "Hypothetical bolus",
                                                " · ",
                                                scientificNumber(event.amount_mg),
                                                " mg at ",
                                                scientificNumber(event.start_h),
                                                " h",
                                                "duration_h" in event ? ` over ${scientificNumber(event.duration_h)} h` : ""
                                            ]
                                        }, index))
                                }),
                                /*#__PURE__*/ _jsx(ParameterTable, {
                                    rows: s.parameter_evidence ?? [],
                                    config: config,
                                    experimentId: snapshot.experiment_id
                                })
                            ]
                        }, s.scenario_id))
                ]
            })
        ]
    });
}
export function InvestigationPanel({ job, submitting, saved, displayedResult, config, message, viewer = "unavailable", onFocusMeasurement }) {
    const view = useMemo(()=>investigationView(job), [
        job
    ]);
    // Measurement values come from the completed turn; ledger events carry only their identifiers.
    const cards = useMemo(()=>measurementCards(job?.turn ?? null), [
        job?.turn
    ]);
    const busy = submitting || job?.status === "queued" || job?.status === "running";
    const [open, setOpen] = useState(false), [clock, setClock] = useState(0);
    const runKey = job?.execution_run_id ?? job?.job_id ?? (submitting ? "submitting" : null);
    useEffect(()=>{
        if (runKey) setOpen(true);
        else setOpen(false);
    }, [
        runKey
    ]);
    useEffect(()=>{
        if (!busy) return;
        setClock(Date.now());
        const timer = setInterval(()=>setClock(Date.now()), 1000);
        return ()=>clearInterval(timer);
    }, [
        busy
    ]);
    const activeSeconds = view.active ? Math.max(0, (clock - Date.parse(view.active.start.timestamp)) / 1000) : null;
    const current = view.accepted && view.result?.result_id === displayedResult?.result_id && view.result?.configuration_hash === displayedResult?.configuration_hash;
    const title = view.invalid ? "Execution record could not be verified" : submitting ? "Submitting investigation" : !job ? saved ? "Saved reference results" : "Ready to investigate" : job.status === "queued" ? "Waiting for an agent slot" : job.status === "failed" ? "Investigation stopped" : view.accepted ? "Investigation complete" : job.status === "completed" ? view.legacy && view.result ? "Earlier linked result available" : job.turn?.status === "unsupported" ? "Model outside supported scope" : job.turn?.status === "needs_inputs" ? "Research needs your input" : "Run finished without a verified result" : view.active ? toolLabel(view.active.start) : "Agent is working";
    return /*#__PURE__*/ _jsxs("section", {
        id: "investigation",
        className: `investigation-panel ${busy ? "is-working" : ""}`,
        "aria-label": "Agent investigation",
        children: [
            /*#__PURE__*/ _jsxs("details", {
                open: open,
                onToggle: (e)=>setOpen(e.currentTarget.open),
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            /*#__PURE__*/ _jsxs("span", {
                                className: "investigation-heading",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "eyebrow",
                                        children: "Agent investigation"
                                    }),
                                    /*#__PURE__*/ _jsx("strong", {
                                        "aria-live": "polite",
                                        "aria-atomic": "true",
                                        children: title
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: "execution-mode",
                                children: saved && !job ? "Saved · no live execution" : job?.status === "completed" || job?.status === "failed" ? "Recorded execution" : busy ? "Live tool activity" : "Nemotron + scientific tools"
                            })
                        ]
                    }),
                    !job ? /*#__PURE__*/ _jsx("p", {
                        children: saved ? "These are saved reviewed reference results. No live paper retrieval or tool sequence was run for this view." : submitting ? "Waiting for the server to accept this request. No scientific result has returned." : message ?? "Start research or request an experiment edit to see actual tools, parameters and numerical results here."
                    }) : /*#__PURE__*/ _jsxs(_Fragment, {
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                className: "investigation-state",
                                role: "status",
                                children: view.invalid ? "The ledger is inconsistent. No execution claims are shown." : view.accepted ? current ? "The accepted result is displayed below." : "This run completed. The displayed curves now belong to a different result." : job.status === "failed" ? job.error_message ?? "No completed agent result was accepted. The last successful curves are preserved." : job.status === "completed" && view.legacy && view.result ? "This earlier result has no structured execution ledger. No tool outcomes are inferred." : job.status === "completed" ? "No new simulation result was accepted. Review the questions and evidence; previous curves remain available." : "Investigation in progress. The graphs below show the previous successful experiment until a complete result is accepted."
                            }),
                            message && message !== job.error_message && /*#__PURE__*/ _jsx("p", {
                                className: "execution-connection-note",
                                children: message
                            }),
                            view.legacy ? /*#__PURE__*/ _jsxs("p", {
                                children: [
                                    "Structured execution records are not available for this ",
                                    busy ? "request yet" : "older run",
                                    ". No tool outcomes are inferred from activity messages."
                                ]
                            }) : !view.invalid && /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    /*#__PURE__*/ _jsx("ol", {
                                        className: "investigation-stages",
                                        "aria-label": "Observed investigation stages",
                                        children: view.stages.map((stage)=>/*#__PURE__*/ _jsxs("li", {
                                                "data-state": stage.state,
                                                children: [
                                                    /*#__PURE__*/ _jsx("strong", {
                                                        children: stage.label
                                                    }),
                                                    /*#__PURE__*/ _jsx("span", {
                                                        children: stageSummary(stage.attempts, !!busy)
                                                    })
                                                ]
                                            }, stage.id))
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "execution-totals",
                                        children: [
                                            /*#__PURE__*/ _jsxs("span", {
                                                children: [
                                                    view.attempts.length,
                                                    " tool invocation(s)"
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("span", {
                                                children: [
                                                    view.sourceCount,
                                                    " distinct source(s) retrieved"
                                                ]
                                            }),
                                            view.active && /*#__PURE__*/ _jsxs("span", {
                                                children: [
                                                    activeSeconds != null ? `${Math.floor(activeSeconds)} s elapsed · ` : "",
                                                    toolLabel(view.active.start)
                                                ]
                                            }),
                                            view.runEnd?.elapsed_ms != null && /*#__PURE__*/ _jsxs("span", {
                                                children: [
                                                    "Run elapsed: ",
                                                    (view.runEnd.elapsed_ms / 1000).toFixed(1),
                                                    " s"
                                                ]
                                            })
                                        ]
                                    }),
                                    view.snapshot && /*#__PURE__*/ _jsx(ConfigurationDetails, {
                                        snapshot: view.snapshot,
                                        config: job.turn?.result?.configuration ?? config
                                    }),
                                    view.receipt && /*#__PURE__*/ _jsxs("section", {
                                        className: `execution-receipt ${view.accepted ? "accepted" : "unaccepted"}`,
                                        "aria-label": "Numerical tool result",
                                        children: [
                                            /*#__PURE__*/ _jsxs("div", {
                                                className: "execution-section-heading",
                                                children: [
                                                    /*#__PURE__*/ _jsx("h3", {
                                                        children: view.accepted ? "Accepted numerical result" : "Numerical tool returned · agent result not accepted"
                                                    }),
                                                    /*#__PURE__*/ _jsxs("span", {
                                                        children: [
                                                            view.receipt.output_point_count,
                                                            " aligned time samples"
                                                        ]
                                                    })
                                                ]
                                            }),
                                            !view.accepted && /*#__PURE__*/ _jsx("p", {
                                                children: "The solver returned these values, but the agent run has not completed successfully. They do not replace the displayed curves."
                                            }),
                                            /*#__PURE__*/ _jsx("div", {
                                                className: "execution-metrics",
                                                children: view.receipt.metrics.map((metric)=>/*#__PURE__*/ _jsxs("div", {
                                                        children: [
                                                            /*#__PURE__*/ _jsx("span", {
                                                                children: (job.turn?.result?.configuration ?? config).scenarios.find((s)=>s.scenario_id === metric.scenario_id)?.label ?? metric.scenario_id
                                                            }),
                                                            /*#__PURE__*/ _jsxs("strong", {
                                                                children: [
                                                                    (metric.endpoint_occupancy * 100).toFixed(2),
                                                                    "%"
                                                                ]
                                                            }),
                                                            /*#__PURE__*/ _jsxs("small", {
                                                                children: [
                                                                    "Endpoint occupancy · ",
                                                                    scientificNumber(metric.occupancy_auc_h / 24),
                                                                    " occupancy AUC days"
                                                                ]
                                                            }),
                                                            /*#__PURE__*/ _jsx("small", {
                                                                children: metric.threshold_status.replaceAll("_", " ")
                                                            })
                                                        ]
                                                    }, metric.scenario_id))
                                            }),
                                            /*#__PURE__*/ _jsx("p", {
                                                children: "Conditional model output; target occupancy does not establish efficacy or safety."
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("details", {
                                        className: "execution-tools",
                                        children: [
                                            /*#__PURE__*/ _jsxs("summary", {
                                                children: [
                                                    "Tool-by-tool execution · ",
                                                    view.attempts.length,
                                                    " invocation(s)"
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("ol", {
                                                children: view.attempts.map((attempt)=>/*#__PURE__*/ _jsxs("li", {
                                                        "data-state": attempt.outcome?.state ?? "started",
                                                        children: [
                                                            /*#__PURE__*/ _jsxs("div", {
                                                                children: [
                                                                    /*#__PURE__*/ _jsx("strong", {
                                                                        children: toolLabel(attempt.start)
                                                                    }),
                                                                    /*#__PURE__*/ _jsxs("span", {
                                                                        children: [
                                                                            stateLabel(attempt.outcome?.state ?? "started"),
                                                                            attempt.outcome?.elapsed_ms != null ? ` · ${(attempt.outcome.elapsed_ms / 1000).toFixed(2)} s` : ""
                                                                        ]
                                                                    })
                                                                ]
                                                            }),
                                                            attempt.outcome?.summary && /*#__PURE__*/ _jsxs("p", {
                                                                children: [
                                                                    attempt.outcome.summary.source_count != null && `${attempt.outcome.summary.source_count} source handle(s)/record(s). `,
                                                                    attempt.outcome.summary.candidate_count != null && `${attempt.outcome.summary.candidate_count} cited candidate value(s). `,
                                                                    attempt.outcome.summary.missing_input_count != null && `${attempt.outcome.summary.missing_input_count} outstanding input(s). `,
                                                                    attempt.outcome.summary.preparation_state && `Preparation: ${attempt.outcome.summary.preparation_state.replaceAll("_", " ")}. `,
                                                                    attempt.outcome.summary.outcome === "no_values" && "Extraction finished without numerical candidates. ",
                                                                    attempt.outcome.summary.error_code && `Outcome: ${attempt.outcome.summary.error_code}. `
                                                                ]
                                                            }),
                                                            attempt.outcome?.summary?.structure && (attempt.outcome.summary.structure.available ? /*#__PURE__*/ _jsxs(_Fragment, {
                                                                children: [
                                                                    /*#__PURE__*/ _jsxs("p", {
                                                                        children: [
                                                                            "PDB ",
                                                                            attempt.outcome.summary.structure.pdb_id,
                                                                            attempt.outcome.summary.structure.interface_residue_pair_count != null ? ` · ${attempt.outcome.summary.structure.interface_residue_pair_count} interface residue pairs within 4 Å` : "",
                                                                            " · ",
                                                                            (attempt.outcome.summary.structure.measurement_ids ?? []).length,
                                                                            " measurement(s) returned. Geometry only."
                                                                        ]
                                                                    }),
                                                                    /*#__PURE__*/ _jsx(MeasurementCards, {
                                                                        cards: cards.filter((card)=>(attempt.outcome.summary.structure.measurement_ids ?? []).includes(card.id)),
                                                                        viewer: viewer,
                                                                        onFocus: onFocusMeasurement
                                                                    })
                                                                ]
                                                            }) : /*#__PURE__*/ _jsx("p", {
                                                                children: "No verified experimental structure exists for this drug and target. Research and simulation are unaffected."
                                                            })),
                                                            !!attempt.outcome?.summary?.sources?.length && /*#__PURE__*/ _jsx("ul", {
                                                                className: "execution-sources",
                                                                children: attempt.outcome.summary.sources.map((source, i)=>/*#__PURE__*/ _jsxs("li", {
                                                                        children: [
                                                                            source.source_id ?? source.source_handle ?? "Source",
                                                                            source.content_kind ? ` · ${source.content_kind.replaceAll("_", " ")}` : "",
                                                                            source.retrieval_status ? ` · ${source.retrieval_status}` : ""
                                                                        ]
                                                                    }, i))
                                                            })
                                                        ]
                                                    }, attempt.start.tool_call_id))
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("details", {
                                className: "execution-identifiers",
                                children: [
                                    /*#__PURE__*/ _jsx("summary", {
                                        children: "Run identifiers & trace"
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            "Run: ",
                                            job.execution_run_id ?? "Legacy record"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            "Job: ",
                                            job.job_id,
                                            " · ",
                                            job.mode
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            "Trace: ",
                                            job.turn?.trace_status ?? "Not available yet",
                                            " · ",
                                            job.turn?.trace_id ?? "—"
                                        ]
                                    }),
                                    view.snapshot && /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            "Configured hash: ",
                                            view.snapshot.configuration_sha256
                                        ]
                                    }),
                                    view.receipt && /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            "Solver result: ",
                                            view.receipt.result_id,
                                            " · ",
                                            view.receipt.model_version,
                                            " · ",
                                            view.receipt.solver_version
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }),
            !job && !open && /*#__PURE__*/ _jsx("p", {
                className: "investigation-idle",
                children: saved ? "Saved results are labeled separately from live agent execution." : "Actual tool outcomes and configured experiments appear here when you run research or edit a result."
            })
        ]
    });
}
