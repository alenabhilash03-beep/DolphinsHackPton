"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function PaperSummaries({ summaries, experiment }) {
    return /*#__PURE__*/ _jsxs("div", {
        className: "paper-summaries",
        children: [
            /*#__PURE__*/ _jsx("h3", {
                children: "How the papers inform these plots"
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    "Source-linked summaries of parameter inputs. Review status is shown for each source. The plotted scenarios are model predictions, not digitized results from these papers.",
                    experiment.mode === "custom" && " Current control edits are unreviewed hypothetical inputs; these papers describe the reference inputs."
                ]
            }),
            summaries.map((summary)=>{
                const source = experiment.sources.find((item)=>item.source_id === summary.source_id);
                if (!source) return null;
                const reviewed = summary.evidence_ids.every((id)=>experiment.evidence.find((e)=>e.evidence_id === id)?.review_status === "reviewed");
                return /*#__PURE__*/ _jsxs("article", {
                    className: "paper-card",
                    children: [
                        /*#__PURE__*/ _jsxs("span", {
                            className: "scope-badge",
                            children: [
                                summary.source_id,
                                " · ",
                                reviewed ? "Reviewed reference inputs" : "Candidate source inputs · conditional"
                            ]
                        }),
                        /*#__PURE__*/ _jsx("h3", {
                            children: /*#__PURE__*/ _jsxs("a", {
                                href: source.url,
                                target: "_blank",
                                rel: "noreferrer",
                                children: [
                                    source.title,
                                    " ↗"
                                ]
                            })
                        }),
                        /*#__PURE__*/ _jsx("p", {
                            className: "paper-key-finding",
                            children: summary.finding
                        }),
                        /*#__PURE__*/ _jsxs("details", {
                            children: [
                                /*#__PURE__*/ _jsx("summary", {
                                    children: "Hypothesis relevance & source locator"
                                }),
                                /*#__PURE__*/ _jsx("p", {
                                    children: summary.hypothesis_relevance
                                }),
                                /*#__PURE__*/ _jsxs("p", {
                                    children: [
                                        summary.locator,
                                        " · parameter records: ",
                                        summary.evidence_ids.join(", ")
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("p", {
                            children: [
                                /*#__PURE__*/ _jsx("strong", {
                                    children: "Connection to your curves:"
                                }),
                                " ",
                                summary.use_in_model
                            ]
                        }),
                        /*#__PURE__*/ _jsx("div", {
                            className: "paper-plot-links",
                            children: summary.plot_ids.map((id)=>/*#__PURE__*/ _jsxs("a", {
                                    href: `#plot-${id}`,
                                    children: [
                                        "View ",
                                        id === "concentration" ? "PK concentration" : "occupancy",
                                        " plot →"
                                    ]
                                }, id))
                        }),
                        /*#__PURE__*/ _jsxs("p", {
                            className: "paper-limit",
                            children: [
                                /*#__PURE__*/ _jsx("strong", {
                                    children: "Limit:"
                                }),
                                " ",
                                summary.limitation
                            ]
                        })
                    ]
                }, summary.source_id);
            })
        ]
    });
}
