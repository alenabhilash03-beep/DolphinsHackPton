"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from "react";
import { comparisonSummary, thresholdDescription } from "../lib/comparison-summary.js";
import { scenarioColor } from "../lib/plot-spec.js";
/** Current solver result only; all scientific numbers come from backend metrics. */ export const ScenarioComparison = /*#__PURE__*/ memo(function ScenarioComparison({ result, busy }) {
    const config = result.configuration;
    const summary = comparisonSummary(result);
    const evidence = new Map(config.evidence.map((item)=>[
            item.evidence_id,
            item
        ]));
    const sourcesFor = (id)=>{
        const item = evidence.get(id);
        return [
            ...new Set([
                ...item?.source_ids ?? [],
                ...(item?.parent_ids ?? []).flatMap(sourcesFor)
            ])
        ];
    };
    return /*#__PURE__*/ _jsxs("section", {
        "aria-label": "Scenario comparison",
        children: [
            /*#__PURE__*/ _jsx("h2", {
                children: "Scenario register"
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    config.mode === "research_derived" ? "Conditional research-derived / researcher-specified experiment" : config.mode === "custom" ? "Custom hypothetical comparison" : "Reviewed preset with hypothetical alternatives",
                    " · ",
                    config.support.status,
                    " model scope."
                ]
            }),
            /*#__PURE__*/ _jsx("p", {
                role: "status",
                children: busy ? "Recalculating. The comparison below shows the last completed result." : `Showing completed result ${result.result_id}.`
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "scenario-register",
                children: config.scenarios.map((scenario, index)=>/*#__PURE__*/ _jsxs("article", {
                        style: {
                            borderLeft: `2px solid ${scenarioColor(scenario.scenario_id, index)}`
                        },
                        children: [
                            /*#__PURE__*/ _jsx("h3", {
                                children: scenario.label
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                children: scenario.intervention === "baseline" ? "Protected reference scenario" : "Hypothetical intervention"
                            }),
                            /*#__PURE__*/ _jsxs("dl", {
                                children: [
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Effective elimination half-life"
                                    }),
                                    /*#__PURE__*/ _jsxs("dd", {
                                        children: [
                                            (scenario.pk.elimination_half_life_h / 24).toFixed(2),
                                            " days"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Model binding affinity KD"
                                    }),
                                    /*#__PURE__*/ _jsxs("dd", {
                                        children: [
                                            scenario.binding.affinity_nM.toPrecision(4),
                                            " nM"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Association / dissociation"
                                    }),
                                    /*#__PURE__*/ _jsxs("dd", {
                                        children: [
                                            scenario.binding.association_nM_inv_h_inv.toPrecision(4),
                                            " nM⁻¹ h⁻¹ / ",
                                            scenario.binding.dissociation_h_inv.toPrecision(4),
                                            " h⁻¹"
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Administration"
                                    }),
                                    /*#__PURE__*/ _jsxs("dd", {
                                        children: [
                                            scenario.administration.length === 1 ? "1 dose" : `${scenario.administration.length} doses`,
                                            " · first amount ",
                                            scenario.administration[0].amount_mg.toFixed(1),
                                            " mg"
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("details", {
                                children: [
                                    /*#__PURE__*/ _jsx("summary", {
                                        children: "Input evidence"
                                    }),
                                    /*#__PURE__*/ _jsx("ul", {
                                        children: [
                                            "pk.elimination_half_life_h",
                                            "binding.affinity_nM"
                                        ].map((path)=>{
                                            const item = evidence.get(scenario.parameter_evidence[path]);
                                            return item && /*#__PURE__*/ _jsxs("li", {
                                                children: [
                                                    item.parameter,
                                                    ": ",
                                                    /*#__PURE__*/ _jsx("strong", {
                                                        children: item.provenance
                                                    }),
                                                    " · ",
                                                    item.applicability,
                                                    " · ",
                                                    item.review_status,
                                                    item.source_ids?.length ? ` · ${item.source_ids.join(", ")}` : "",
                                                    item.parent_ids?.length ? ` · derived from ${item.parent_ids.join(", ")}` : ""
                                                ]
                                            }, path);
                                        })
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("p", {
                                children: [
                                    "Evidence sources: ",
                                    [
                                        ...new Set(Object.values(scenario.parameter_evidence).flatMap(sourcesFor))
                                    ].map((id)=>{
                                        const source = config.sources.find((item)=>item.source_id === id);
                                        return source && /*#__PURE__*/ _jsx("a", {
                                            href: source.url,
                                            target: "_blank",
                                            rel: "noreferrer",
                                            style: {
                                                marginRight: 8
                                            },
                                            children: id
                                        }, id);
                                    })
                                ]
                            })
                        ]
                    }, scenario.scenario_id))
            }),
            /*#__PURE__*/ _jsxs("h3", {
                children: [
                    "Numerical comparison over ",
                    (config.duration_h / 24).toFixed(1),
                    " days"
                ]
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    "Occupancy AUC integrates the occupied fraction over time; its day unit is not a measured duration of biological benefit. The ",
                    (config.occupancy_threshold * 100).toFixed(1),
                    "% threshold is analytical."
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                style: {
                    overflowX: "auto"
                },
                children: /*#__PURE__*/ _jsxs("table", {
                    style: {
                        width: "100%",
                        textAlign: "left",
                        borderCollapse: "collapse"
                    },
                    children: [
                        /*#__PURE__*/ _jsx("caption", {
                            children: "Metrics computed by the deterministic numerical engine"
                        }),
                        /*#__PURE__*/ _jsx("thead", {
                            children: /*#__PURE__*/ _jsx("tr", {
                                children: [
                                    "Scenario",
                                    "Endpoint occupancy",
                                    "Occupancy AUC (days)",
                                    "Central concentration AUC (nM·h)",
                                    "Time above threshold (days)",
                                    "Threshold outcome"
                                ].map((label)=>/*#__PURE__*/ _jsx("th", {
                                        scope: "col",
                                        style: {
                                            padding: 8
                                        },
                                        children: label
                                    }, label))
                            })
                        }),
                        /*#__PURE__*/ _jsx("tbody", {
                            children: result.scenarios.map((series)=>/*#__PURE__*/ _jsxs("tr", {
                                    children: [
                                        /*#__PURE__*/ _jsx("th", {
                                            scope: "row",
                                            style: {
                                                padding: 8
                                            },
                                            children: config.scenarios.find((scenario)=>scenario.scenario_id === series.scenario_id)?.label
                                        }),
                                        /*#__PURE__*/ _jsxs("td", {
                                            children: [
                                                (series.metrics.endpoint_occupancy * 100).toFixed(2),
                                                "%"
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsx("td", {
                                            children: (series.metrics.occupancy_auc_h / 24).toFixed(3)
                                        }),
                                        /*#__PURE__*/ _jsx("td", {
                                            children: series.metrics.concentration_auc_nM_h.toPrecision(5)
                                        }),
                                        /*#__PURE__*/ _jsx("td", {
                                            children: (series.metrics.threshold.total_time_above_h / 24).toFixed(3)
                                        }),
                                        /*#__PURE__*/ _jsx("td", {
                                            children: thresholdDescription(series.metrics.threshold)
                                        })
                                    ]
                                }, series.scenario_id))
                        })
                    ]
                })
            }),
            /*#__PURE__*/ _jsx("h3", {
                children: "What the current model predicts"
            }),
            /*#__PURE__*/ _jsx("ul", {
                children: summary.claims.map((claim)=>/*#__PURE__*/ _jsx("li", {
                        children: claim
                    }, claim))
            }),
            /*#__PURE__*/ _jsx("h3", {
                children: "Experiments that could test these assumptions"
            }),
            /*#__PURE__*/ _jsx("ul", {
                children: summary.followUps.map((item)=>/*#__PURE__*/ _jsx("li", {
                        children: item
                    }, item))
            }),
            /*#__PURE__*/ _jsxs("details", {
                children: [
                    /*#__PURE__*/ _jsx("summary", {
                        children: "Model assumptions and warnings"
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: config.assumptions.map((item)=>/*#__PURE__*/ _jsx("li", {
                                children: item.description
                            }, item.assumption_id))
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: result.warnings.map((warning)=>/*#__PURE__*/ _jsx("li", {
                                children: warning
                            }, warning))
                    })
                ]
            })
        ]
    });
});
