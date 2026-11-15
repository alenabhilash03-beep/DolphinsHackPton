"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { PaperSummaries } from "./PaperSummaries.jsx";
import { parameterLabel, scientificNumber, unitLabel } from "../lib/investigation.js";
import { humanize, locatorLabel } from "../lib/readable.js";
/** Plain evidence view for the UI team to restyle; never upgrades cache metadata to reviewed data. */ export function EvidencePanel({ experiment, scenarioId, resultPresent = false, showSummaries = true }) {
    const [profile, setProfile] = useState(null);
    const [cacheError, setCacheError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const primary = experiment.mode !== "research_derived" && experiment.sources.some((source)=>source.source_id === "S2");
    useEffect(()=>{
        if (!primary) {
            setProfile(null);
            setCacheError(false);
            return;
        }
        const controller = new AbortController();
        fetch("/api/research/evidence/trastuzumab", {
            cache: "no-store",
            signal: controller.signal
        }).then(async (response)=>{
            if (!response.ok) throw new Error("Evidence metadata unavailable");
            return response.json();
        }).then((value)=>{
            if (!Array.isArray(value.literature)) throw new Error("Evidence metadata unavailable");
            setProfile(value);
            setCacheError(false);
        }).catch(()=>{
            if (!controller.signal.aborted) setCacheError(true);
        });
        return ()=>controller.abort();
    }, [
        attempt,
        primary
    ]);
    const scenario = experiment.scenarios.find((item)=>item.scenario_id === scenarioId) ?? experiment.scenarios[0];
    const values = useMemo(()=>{
        const byId = new Map(experiment.evidence.map((item)=>[
                item.evidence_id,
                item
            ]));
        return Object.entries(scenario.parameter_evidence).map(([path, id])=>({
                path,
                item: byId.get(id)
            })).filter((entry)=>entry.item);
    }, [
        experiment.evidence,
        scenario.parameter_evidence
    ]);
    const cacheBySource = new Map(profile?.literature.map((item)=>[
            item.source_id,
            item
        ]));
    return /*#__PURE__*/ _jsxs("section", {
        id: "paper-evidence",
        "aria-label": "Scientific evidence",
        children: [
            /*#__PURE__*/ _jsx("h2", {
                children: "Evidence and assumptions"
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    "Model scope: ",
                    /*#__PURE__*/ _jsx("strong", {
                        children: experiment.support.status
                    }),
                    " · ",
                    experiment.support.reasons.join(" ")
                ]
            }),
            /*#__PURE__*/ _jsx("p", {
                children: !primary ? "Research-derived inputs remain conditional. Source access and snapshot status are shown in the preparation; no reviewed preset evidence is substituted." : cacheError ? "Bibliographic cache unavailable; source links and the validated experiment remain visible." : profile ? "Europe PMC bibliographic metadata: cached, not a live search. Numerical inputs retain their separate reviewed or assumed provenance." : "Loading cached bibliographic metadata…"
            }),
            cacheError && /*#__PURE__*/ _jsx("button", {
                type: "button",
                onClick: ()=>{
                    setCacheError(false);
                    setAttempt((value)=>value + 1);
                },
                children: "Retry evidence metadata"
            }),
            showSummaries && primary && profile?.paper_summaries && /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsx("h3", {
                        children: "How each source is used"
                    }),
                    /*#__PURE__*/ _jsx(PaperSummaries, {
                        summaries: profile.paper_summaries,
                        experiment: experiment
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("details", {
                className: "detail-bar",
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "Parameter provenance · ",
                            scenario.label
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: values.map(({ path, item })=>item && /*#__PURE__*/ _jsxs("li", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: parameterLabel(path)
                                    }),
                                    ": ",
                                    scientificNumber(item.value),
                                    " ",
                                    unitLabel(item.unit),
                                    " · ",
                                    humanize(item.provenance),
                                    " · ",
                                    humanize(item.review_status),
                                    (item.source_ids?.length ?? 0) > 0 && /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            " · ",
                                            item.source_ids?.join(", "),
                                            item.locator ? `, ${locatorLabel(item.locator)}` : ""
                                        ]
                                    }),
                                    item.provenance === "user_supplied" && /*#__PURE__*/ _jsx(_Fragment, {
                                        children: " · unreviewed hypothetical input"
                                    })
                                ]
                            }, path))
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("h3", {
                children: "Limits"
            }),
            /*#__PURE__*/ _jsx("ul", {
                children: experiment.limitations.filter((limit)=>!(resultPresent && limit === "Configuration fixture only: no simulator has run.")).map((limit)=>/*#__PURE__*/ _jsx("li", {
                        children: limit
                    }, limit))
            })
        ]
    });
}
