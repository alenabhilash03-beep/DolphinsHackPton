import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { plural, unitLabel } from "../lib/investigation.js";
export function ResearchPaperReview({ papers }) {
    if (!papers.length) return null;
    return /*#__PURE__*/ _jsxs("section", {
        className: "research-panel",
        "aria-label": "Papers inspected in this run",
        children: [
            /*#__PURE__*/ _jsx("p", {
                className: "eyebrow",
                children: "Live literature review"
            }),
            /*#__PURE__*/ _jsx("h2", {
                children: "Papers read & values extracted"
            }),
            papers.map((paper)=>/*#__PURE__*/ _jsxs("article", {
                    id: `paper-${paper.document_id}`,
                    style: {
                        scrollMarginTop: 88
                    },
                    children: [
                        /*#__PURE__*/ _jsx("h3", {
                            children: /*#__PURE__*/ _jsxs("a", {
                                href: paper.source.url,
                                target: "_blank",
                                rel: "noreferrer",
                                children: [
                                    paper.source.title,
                                    " ↗"
                                ]
                            })
                        }),
                        /*#__PURE__*/ _jsxs("p", {
                            children: [
                                paper.source.content_kind === "abstract" ? "Abstract only" : "Bounded full-text passages",
                                " · ",
                                paper.source.retrieval_status,
                                " · ",
                                plural((paper.extraction.parameters ?? []).length, "cited candidate value")
                            ]
                        }),
                        paper.use_in_simulation === "reviewed_reference_separate" && /*#__PURE__*/ _jsx("p", {
                            className: "scope-note",
                            children: "These papers were inspected in this run. The simulation uses the separately audited reference inputs shown with the graphs; these fresh candidates did not replace them."
                        }),
                        paper.extraction.status === "no_values" && /*#__PURE__*/ _jsx("p", {
                            children: "No supported numerical parameters were found in the inspected passages. This does not mean the whole paper or wider literature lacks relevant data."
                        }),
                        paper.extraction.status === "unavailable" && /*#__PURE__*/ _jsx("p", {
                            children: "Extraction could not be completed. No values from this attempt were accepted."
                        }),
                        paper.extraction.status === "rejected" && /*#__PURE__*/ _jsx("p", {
                            children: "The extraction produced no accepted candidates after source checks."
                        }),
                        /*#__PURE__*/ _jsxs("details", {
                            children: [
                                /*#__PURE__*/ _jsx("summary", {
                                    children: "Inspect extracted values & source passages"
                                }),
                                (paper.extraction.parameters ?? []).map((value)=>/*#__PURE__*/ _jsxs("div", {
                                        children: [
                                            /*#__PURE__*/ _jsxs("p", {
                                                children: [
                                                    /*#__PURE__*/ _jsxs("strong", {
                                                        children: [
                                                            value.parameter,
                                                            ": ",
                                                            value.original_value,
                                                            " ",
                                                            unitLabel(value.original_unit)
                                                        ]
                                                    }),
                                                    " · reported candidate · applicability not yet approved"
                                                ]
                                            }),
                                            value.passages?.map((passage, index)=>/*#__PURE__*/ _jsxs("blockquote", {
                                                    children: [
                                                        passage.supporting_passage,
                                                        /*#__PURE__*/ _jsx("br", {}),
                                                        /*#__PURE__*/ _jsx("small", {
                                                            children: passage.locator
                                                        })
                                                    ]
                                                }, index))
                                        ]
                                    }, value.parameter_id)),
                                /*#__PURE__*/ _jsxs("p", {
                                    children: [
                                        "Inspected locators: ",
                                        paper.inspected_locators.join(", ")
                                    ]
                                }),
                                (paper.extraction.rejected_candidates ?? []).map((reason, index)=>/*#__PURE__*/ _jsx("p", {
                                        children: reason
                                    }, index)),
                                (paper.extraction.notes ?? []).map((note, index)=>/*#__PURE__*/ _jsx("p", {
                                        children: note
                                    }, index))
                            ]
                        })
                    ]
                }, paper.document_id))
        ]
    });
}
