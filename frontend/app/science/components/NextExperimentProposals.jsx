"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { changeText, proposalMatches } from "../lib/proposal-view.js";
/** Runnable follow-ups for the displayed result. The server derives them from solver facts; nothing is computed here. */ export function NextExperimentProposals({ shown, busy, onRun }) {
    const [set, setSet] = useState(null), [failed, setFailed] = useState(false);
    const resultId = shown?.result_id ?? null;
    useEffect(()=>{
        setSet(null);
        setFailed(false);
        if (!resultId) return;
        const abort = new AbortController();
        fetch(`/api/agent/results/${encodeURIComponent(resultId)}/proposals`, {
            cache: "no-store",
            signal: abort.signal
        }).then(async (response)=>{
            if (!response.ok) throw new Error("unavailable");
            return response.json();
        }).then((value)=>{
            if (!abort.signal.aborted && value.base_result_id === resultId) setSet(value);
        }).catch(()=>{
            if (!abort.signal.aborted) setFailed(true);
        });
        return ()=>abort.abort();
    }, [
        resultId
    ]);
    if (!shown) return null;
    const proposals = (set?.proposals ?? []).filter((proposal)=>proposalMatches(proposal, shown));
    return /*#__PURE__*/ _jsxs("section", {
        id: "next-experiments",
        className: "proposal-panel",
        "aria-label": "Follow-up experiments",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "answer-section-heading",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("p", {
                                className: "eyebrow",
                                children: "Next experiments"
                            }),
                            /*#__PURE__*/ _jsx("h2", {
                                children: "Run a follow-up experiment"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("span", {
                        children: [
                            "For displayed curves: ",
                            shown.configuration.drug,
                            " → ",
                            shown.configuration.target,
                            ". Derived from this result's solver values."
                        ]
                    })
                ]
            }),
            failed ? /*#__PURE__*/ _jsx("p", {
                className: "answer-access-note",
                children: "Follow-up proposals are unavailable for these curves right now. You can still change the experiment in words or with the controls."
            }) : !set ? /*#__PURE__*/ _jsx("p", {
                className: "answer-access-note",
                role: "status",
                children: "Checking this result for follow-up experiments…"
            }) : !proposals.length ? /*#__PURE__*/ _jsx("p", {
                className: "answer-access-note",
                children: "No follow-up experiment is suggested for this result. You can still change the experiment in words or with the controls."
            }) : /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    set.status === "superseded" && /*#__PURE__*/ _jsx("p", {
                        className: "history-branch",
                        role: "status",
                        children: set.note
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        className: "proposal-cards",
                        children: proposals.map((proposal)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: proposal.title
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        className: "proposal-question",
                                        children: [
                                            /*#__PURE__*/ _jsx("strong", {
                                                children: "Tests:"
                                            }),
                                            " ",
                                            proposal.question_tested
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            /*#__PURE__*/ _jsx("strong", {
                                                children: "Because:"
                                            }),
                                            " ",
                                            proposal.observation,
                                            " ",
                                            proposal.rationale
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("ul", {
                                        className: "proposal-changes",
                                        "aria-label": "Exact changes",
                                        children: proposal.changes.map((change, index)=>/*#__PURE__*/ _jsx("li", {
                                                children: changeText(change)
                                            }, index))
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        className: "proposal-scope",
                                        children: [
                                            proposal.scope_note,
                                            " Base result ",
                                            proposal.base_result_id,
                                            "."
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        className: "primary-button",
                                        disabled: busy,
                                        onClick: ()=>onRun(proposal),
                                        children: "Run this experiment →"
                                    }),
                                    /*#__PURE__*/ _jsxs("small", {
                                        children: [
                                            "Same as typing: “",
                                            proposal.edit_text,
                                            "”"
                                        ]
                                    })
                                ]
                            }, proposal.proposal_id))
                    })
                ]
            })
        ]
    });
}
