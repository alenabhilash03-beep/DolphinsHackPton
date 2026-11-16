"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * A research run that ended without a simulation still presents everything it gathered: the question, the
 * evidence-only answer, every paper (with Delve deeper), the cited values extracted, and the verified structure.
 * What a simulation would still need is listed last, collapsed, instead of being the headline.
 */ import { useMemo, useState } from "react";
import { listPapers } from "../lib/paper-list.js";
import { PaperList, PaperReader } from "./PaperReader.jsx";
import { ResearchPaperReview } from "./ResearchPaperReview.jsx";
import { ScientificAnswer } from "./ScientificAnswer.jsx";
export function EvidenceReport({ turn, question, system, structure, viewer = "unavailable", onFocusMeasurement, needs }) {
    const [reader, setReader] = useState(null);
    const papers = useMemo(()=>listPapers(turn, null), [
        turn
    ]);
    const values = (turn.research_papers ?? []).reduce((count, paper)=>count + (paper.extraction?.parameters?.length ?? 0), 0);
    const structureFound = turn.structure?.status === "available";
    return /*#__PURE__*/ _jsxs("div", {
        className: "investigation-view evidence-report",
        id: "answer",
        children: [
            /*#__PURE__*/ _jsxs("section", {
                className: "investigation-question",
                "aria-label": "Question",
                children: [
                    /*#__PURE__*/ _jsx("p", {
                        className: "eyebrow",
                        children: "Question"
                    }),
                    /*#__PURE__*/ _jsx("h2", {
                        children: question
                    }),
                    /*#__PURE__*/ _jsxs("dl", {
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "System"
                                    }),
                                    /*#__PURE__*/ _jsx("dd", {
                                        children: system
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Papers read"
                                    }),
                                    /*#__PURE__*/ _jsx("dd", {
                                        children: papers.length
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Cited values"
                                    }),
                                    /*#__PURE__*/ _jsx("dd", {
                                        children: values
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Structure"
                                    }),
                                    /*#__PURE__*/ _jsx("dd", {
                                        children: structureFound ? `PDB ${turn.structure?.metadata?.provenance?.pdb_id ?? ""}` : "None verified"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("dt", {
                                        children: "Simulation"
                                    }),
                                    /*#__PURE__*/ _jsx("dd", {
                                        children: "Not run · inputs incomplete"
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsx(ScientificAnswer, {
                turn: turn,
                shown: null,
                viewer: viewer,
                onFocusMeasurement: onFocusMeasurement,
                questionShown: true
            }),
            !turn.synthesis?.answer && !(turn.synthesis?.evidence_findings ?? []).length && /*#__PURE__*/ _jsxs("section", {
                className: "investigation-block evidence-report-note",
                children: [
                    /*#__PURE__*/ _jsx("h2", {
                        children: "What the agent found"
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        children: "The evidence below was gathered for this question. No written answer passed validation, so the papers, values and structure are presented as found."
                    })
                ]
            }),
            reader ? /*#__PURE__*/ _jsx(PaperReader, {
                paper: reader,
                onClose: ()=>setReader(null)
            }) : /*#__PURE__*/ _jsx(PaperList, {
                papers: papers,
                onOpen: setReader
            }),
            values > 0 && /*#__PURE__*/ _jsxs("details", {
                className: "science-records",
                open: true,
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "Values extracted from the papers ",
                            /*#__PURE__*/ _jsx("span", {
                                children: values
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx(ResearchPaperReview, {
                        papers: turn.research_papers ?? []
                    })
                ]
            }),
            structureFound && structure && /*#__PURE__*/ _jsxs("section", {
                className: "investigation-block evidence-report-structure",
                children: [
                    /*#__PURE__*/ _jsx("h2", {
                        children: "Experimental structure"
                    }),
                    structure
                ]
            }),
            needs && /*#__PURE__*/ _jsxs("details", {
                className: "science-records",
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "To run a simulation, the model still needs ",
                            /*#__PURE__*/ _jsx("span", {
                                children: "optional"
                            })
                        ]
                    }),
                    needs
                ]
            })
        ]
    });
}
