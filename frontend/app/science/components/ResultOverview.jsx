"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo } from "react";
import { comparisonSummary, thresholdDescription } from "../lib/comparison-summary.js";
import { scenarioColor } from "../lib/plot-spec.js";
/** Endpoint metrics are server-computed; no efficacy or retention winner is inferred. */ export const ResultOverview = /*#__PURE__*/ memo(function ResultOverview({ result, busy }) {
    const summary = comparisonSummary(result);
    const baseline = result.scenarios[0].metrics.endpoint_occupancy;
    return /*#__PURE__*/ _jsxs("section", {
        className: "result-overview",
        "aria-label": "Key simulation findings",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "overview-heading",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("p", {
                                className: "eyebrow",
                                children: "Result snapshot"
                            }),
                            /*#__PURE__*/ _jsxs("h2", {
                                children: [
                                    "What changes at ",
                                    (result.configuration.duration_h / 24).toFixed(0),
                                    " days?"
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "scope-badge",
                        children: busy ? "Updating · last result shown" : "Conditional model prediction"
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "outcome-grid",
                children: result.scenarios.map((series, index)=>{
                    const scenario = result.configuration.scenarios.find((item)=>item.scenario_id === series.scenario_id);
                    const delta = (series.metrics.endpoint_occupancy - baseline) * 100;
                    return /*#__PURE__*/ _jsxs("article", {
                        className: "outcome-card",
                        style: {
                            borderTopColor: scenarioColor(series.scenario_id, index)
                        },
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                className: "outcome-name",
                                children: scenario.label
                            }),
                            /*#__PURE__*/ _jsxs("strong", {
                                children: [
                                    (series.metrics.endpoint_occupancy * 100).toFixed(2),
                                    /*#__PURE__*/ _jsx("small", {
                                        children: "%"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: "outcome-unit",
                                children: "Endpoint target occupancy"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "outcome-delta",
                                children: index === 0 ? "Protected baseline" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} percentage points vs baseline`
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: "outcome-threshold",
                                children: thresholdDescription(series.metrics.threshold)
                            })
                        ]
                    }, series.scenario_id);
                })
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "finding-callout",
                children: [
                    /*#__PURE__*/ _jsx("span", {
                        "aria-hidden": "true",
                        children: "↳"
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        children: [
                            /*#__PURE__*/ _jsx("strong", {
                                children: "Interpretation boundary"
                            }),
                            summary.claims[summary.claims.length - 2],
                            " ",
                            /*#__PURE__*/ _jsx("span", {
                                children: "Occupancy alone does not establish efficacy or safety."
                            })
                        ]
                    })
                ]
            })
        ]
    });
});
