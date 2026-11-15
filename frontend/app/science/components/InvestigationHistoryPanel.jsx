"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { historyRows } from "../lib/history-view.js";
/** Every stored step of this investigation. Reopening shows a stored result exactly as computed; nothing is rerun. */ export function InvestigationHistoryPanel({ history, shownId, busy, branch, onReopen }) {
    const rows = historyRows(history, shownId);
    if (rows.length < 2) return null;
    return /*#__PURE__*/ _jsx("section", {
        id: "history",
        className: "history-panel",
        "aria-label": "Investigation history",
        children: /*#__PURE__*/ _jsxs("details", {
            open: true,
            children: [
                /*#__PURE__*/ _jsx("summary", {
                    children: /*#__PURE__*/ _jsxs("span", {
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                className: "eyebrow",
                                children: "Investigation history"
                            }),
                            /*#__PURE__*/ _jsxs("strong", {
                                children: [
                                    rows.length,
                                    " steps",
                                    history?.question ? ` · ${history.question}` : ""
                                ]
                            })
                        ]
                    })
                }),
                branch && /*#__PURE__*/ _jsxs("p", {
                    className: "history-branch",
                    role: "status",
                    children: [
                        /*#__PURE__*/ _jsx("strong", {
                            children: "You are viewing an earlier version."
                        }),
                        " An experiment was already run from it. A change in words or a follow-up experiment from here starts a new branch; nothing earlier is overwritten."
                    ]
                }),
                /*#__PURE__*/ _jsx("ol", {
                    className: "history-steps",
                    children: rows.map((row)=>/*#__PURE__*/ _jsxs("li", {
                            "data-displayed": row.displayed,
                            style: {
                                marginLeft: Math.min(row.depth, 6) * 18
                            },
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "history-head",
                                    children: [
                                        /*#__PURE__*/ _jsxs("span", {
                                            className: "history-kind",
                                            children: [
                                                row.step,
                                                " · ",
                                                row.kind
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsx("strong", {
                                            children: row.title
                                        }),
                                        row.displayed ? /*#__PURE__*/ _jsx("span", {
                                            className: "history-current",
                                            children: "Displayed"
                                        }) : /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            disabled: busy,
                                            onClick: ()=>onReopen(row.resultId),
                                            children: "Reopen"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("p", {
                                    className: "history-design",
                                    children: [
                                        row.design,
                                        row.evidence ? ` · ${row.evidence}` : "",
                                        row.branches > 1 ? ` · ${row.branches} branches from here` : ""
                                    ]
                                }),
                                row.changes.length > 0 && /*#__PURE__*/ _jsxs("p", {
                                    className: "history-changes",
                                    children: [
                                        "Changed: ",
                                        row.changes.join("; ")
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("ul", {
                                    children: row.outcomes.map((outcome, index)=>/*#__PURE__*/ _jsx("li", {
                                            children: outcome
                                        }, index))
                                }),
                                row.finding && /*#__PURE__*/ _jsxs("p", {
                                    className: "history-finding",
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            children: row.verdict
                                        }),
                                        " ",
                                        row.finding
                                    ]
                                })
                            ]
                        }, row.resultId))
                }),
                history?.truncated && /*#__PURE__*/ _jsx("p", {
                    className: "answer-access-note",
                    children: "This investigation has more steps than are listed here."
                })
            ]
        })
    });
}
