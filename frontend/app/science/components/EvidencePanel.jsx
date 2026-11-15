"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { PaperSummaries } from "./PaperSummaries.jsx";
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
            /*#__PURE__*/ _jsx("h3", {
                children: "Sources"
            }),
            showSummaries && primary && profile?.paper_summaries && /*#__PURE__*/ _jsx(PaperSummaries, {
                summaries: profile.paper_summaries,
                experiment: experiment
            }),
            /*#__PURE__*/ _jsx("ul", {
                children: experiment.sources.map((source)=>{
                    const cached = cacheBySource.get(source.source_id);
                    return /*#__PURE__*/ _jsxs("li", {
                        children: [
                            /*#__PURE__*/ _jsxs("a", {
                                href: source.url,
                                target: "_blank",
                                rel: "noreferrer",
                                children: [
                                    source.source_id,
                                    " · ",
                                    source.title
                                ]
                            }),
                            cached && /*#__PURE__*/ _jsxs("span", {
                                children: [
                                    " · PMID ",
                                    cached.pmid,
                                    " · abstract ",
                                    cached.abstract_available ? "indexed" : "not indexed",
                                    " · ",
                                    "full text ",
                                    cached.full_text_status === "open_access_link" ? "open-access link indexed" : "not confirmed",
                                    " · ",
                                    "cached ",
                                    cached.retrieved_at.slice(0, 10)
                                ]
                            })
                        ]
                    }, source.source_id);
                })
            }),
            /*#__PURE__*/ _jsxs("details", {
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
                                        children: path
                                    }),
                                    ": ",
                                    item.value.toPrecision(6),
                                    " ",
                                    item.unit,
                                    " · ",
                                    item.provenance,
                                    " · ",
                                    item.review_status,
                                    (item.source_ids?.length ?? 0) > 0 && /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            " · ",
                                            item.source_ids?.join(", "),
                                            item.locator ? `, ${item.locator}` : ""
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
