"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequestEpoch, linkedTurnResult, structureKind, researchRouteNotice } from "../lib/agent-workspace.js";
import { PlotPreview } from "./PlotPreview.jsx";
import { StructureViewer } from "./StructureViewer.jsx";
import { VisualizationBoundary } from "./VisualizationBoundary.jsx";
import { DrugSupportPanel } from "./DrugSupportPanel.jsx";
import { PreparationAnswers } from "./PreparationAnswers.jsx";
import { InvestigationPanel } from "./InvestigationPanel.jsx";
import { ResearchPaperReview } from "./ResearchPaperReview.jsx";
import { investigationView } from "../lib/investigation.js";
import { ScientificAnswer } from "./ScientificAnswer.jsx";
import { answerState } from "../lib/synthesis-view.js";
import { NextExperimentProposals } from "./NextExperimentProposals.jsx";
import { proposalRequest, proposalResultForTurn } from "../lib/proposal-view.js";
import { InvestigationHistoryPanel } from "./InvestigationHistoryPanel.jsx";
import { SignInPrompt } from "./AccountMenu.jsx";
import { ShareExperiment } from "./ShareExperiment.jsx";
import { branchRequired, historyFor, restorationAfterJob } from "../lib/history-view.js";
const PRIMARY = "Would tripling trastuzumab's half-life maintain HER2 occupancy longer than improving its binding affinity tenfold?";
const STORAGE = "hypothesim-agent-job-v1";
const SCIENCE_REQUEST = "hypothesim-scientific-request-v1";
const DISPLAYED = "hypothesim-displayed-result-v1";
export function HypothesisWorkspace({ fallbackExperiment = {
    drug: "",
    target: "",
    title: "New experiment",
    scenarios: []
}, initialSnapshot = null, backendAvailable = true, researchAvailable = true, onResultSnapshot, toolbar = null, onLegacy, requestIntent = null }) {
    const [text, setText] = useState(""), [drug, setDrug] = useState(""), [target, setTarget] = useState(""), [route, setRoute] = useState("");
    const [baseline, setBaseline] = useState(false);
    const [researchOpen, setResearchOpen] = useState(false), [agentMode, setAgentMode] = useState("research");
    useEffect(()=>{
        const reveal = ()=>{
            if (window.location.hash === "#research") setResearchOpen(true);
            if (window.location.hash === "#revise") {
                const element = document.getElementById("revise");
                if (element) element.open = true;
            }
        };
        reveal();
        window.addEventListener("hashchange", reveal);
        return ()=>window.removeEventListener("hashchange", reveal);
    }, []);
    const [job, setJob] = useState(null), [jobId, setJobId] = useState(null);
    const [requestHistory, setRequestHistory] = useState([]);
    useEffect(()=>{
        if (!job?.job_id) return;
        const text = job.edit_text || job.research_request?.request.original_hypothesis;
        if (!text) return;
        setRequestHistory((history)=>history.some((item)=>item.id === job.job_id) ? history.map((item)=>item.id === job.job_id ? {
                    ...item,
                    status: job.status
                } : item) : [
                {
                    id: job.job_id,
                    text,
                    status: job.status
                },
                ...history
            ].slice(0, 8));
    }, [
        job
    ]);
    const [turn, setTurn] = useState(null), [record, setRecord] = useState(null);
    const [prepared, setPrepared] = useState(initialSnapshot?.result ?? null), [shown, setShown] = useState(initialSnapshot?.result ?? null);
    const [selected, setSelected] = useState(null), [controlBusy, setControlBusy] = useState(false);
    const [explanation, setExplanation] = useState(initialSnapshot?.interpretation ?? null);
    const [message, setMessage] = useState(null), [submitting, setSubmitting] = useState(false), [saved, setSaved] = useState(!!initialSnapshot);
    const [resumeId, setResumeId] = useState("");
    const [structureFocus, setStructureFocus] = useState(null);
    const [history, setHistory] = useState(null);
    const reopenTicket = useRef(0), restoreResult = useRef(null);
    const [edit, setEdit] = useState("");
    const epoch = useRef(new RequestEpoch()), activeTicket = useRef(0), activeJob = useRef(null);
    const [structureIdentity, setStructureIdentity] = useState({
        drug: fallbackExperiment.drug,
        target: fallbackExperiment.target
    });
    useEffect(()=>{
        if (requestIntent?.mode === "research") {
            setAgentMode("research");
            requestAnimationFrame(()=>document.getElementById("scientific-hypothesis")?.focus());
        }
    }, [
        requestIntent
    ]);
    const busy = submitting || job?.status === "queued" || job?.status === "running";
    const visible = shown?.configuration ?? prepared?.configuration ?? fallbackExperiment;
    const acceptTurn = useCallback((next)=>{
        const result = linkedTurnResult(next);
        setTurn(next);
        setRecord(next.preparation ?? null);
        if (next.preparation) {
            const request = next.preparation.preparation.request;
            setStructureIdentity({
                drug: request.drug_name,
                target: request.target ?? ""
            });
            setDrug(request.drug_name);
            setTarget(request.target ?? "");
            setRoute(request.route ?? "");
            setText(request.original_hypothesis);
        }
        if (result) {
            setPrepared(result);
            setShown(result);
            setExplanation(next.interpretation ?? null);
            setSaved(false);
            setAgentMode("edit");
            setStructureIdentity({
                drug: result.configuration.drug,
                target: result.configuration.target
            });
        }
    }, []);
    useEffect(()=>{
        if (!record) return;
        const request = record.preparation.request;
        try {
            localStorage.setItem(SCIENCE_REQUEST, JSON.stringify(request));
        } catch  {}
        setDrug(request.drug_name);
        setTarget(request.target ?? "");
        setRoute(request.route ?? "");
        setText(request.original_hypothesis);
        setStructureIdentity({
            drug: request.drug_name,
            target: request.target ?? ""
        });
    }, [
        record
    ]);
    useEffect(()=>()=>{
            epoch.current.next();
            activeJob.current = null;
            reopenTicket.current++;
        }, []);
    useEffect(()=>{
        if (!jobId) return;
        let closed = false, timer;
        const abort = new AbortController(), ticket = activeTicket.current;
        async function poll() {
            try {
                const response = await fetch(`/api/agent/jobs/${jobId}`, {
                    cache: "no-store",
                    signal: abort.signal
                });
                if (response.status === 404 && epoch.current.current(ticket)) {
                    setJob({
                        job_id: jobId,
                        status: "failed",
                        mode: "research",
                        updated_at: new Date().toISOString()
                    });
                    activeJob.current = null;
                    setJobId(null);
                    try {
                        localStorage.removeItem(STORAGE);
                    } catch  {}
                    setMessage("Saved research job is unavailable. Start a new research request.");
                    return;
                }
                if (!response.ok) throw new Error("Research status temporarily unavailable; retrying.");
                const next = await response.json();
                if (closed || !epoch.current.current(ticket) || activeJob.current !== jobId) return;
                setJob(next);
                setMessage(null);
                if (next.research_request) {
                    const request = next.research_request.request;
                    setDrug(request.drug_name);
                    setTarget(request.target ?? "");
                    setRoute(request.route ?? "");
                    setText(request.original_hypothesis);
                    setBaseline(next.research_request.structured_baseline ?? false);
                    setStructureIdentity({
                        drug: request.drug_name,
                        target: request.target ?? ""
                    });
                }
                if (next.edit_text) setEdit(next.edit_text);
                if (next.status === "completed" && next.turn) {
                    const execution = investigationView(next);
                    if (execution.invalid || !execution.legacy && next.turn.status === "completed" && !execution.accepted) {
                        setMessage("Agent execution/result linkage could not be verified. Earlier curves are preserved.");
                        return;
                    }
                    acceptTurn(next.turn);
                    // After a reload, return to the result that was on screen if it was a later step than this job's.
                    const saved = restoreResult.current;
                    restoreResult.current = null;
                    const restore = restorationAfterJob(saved, next.turn);
                    if (restore) void reopen(restore.resultId, true, restore.preserveResearchContext);
                    return;
                }
                if (next.status === "failed") {
                    setMessage(next.error_message ?? "Research failed; prior curves remain available.");
                    if (next.preparation_id) {
                        const read = await fetch(`/api/preparations/${next.preparation_id}`, {
                            cache: "no-store",
                            signal: abort.signal
                        });
                        if (read.ok && epoch.current.current(ticket)) setRecord(await read.json());
                    }
                    return;
                }
            } catch (e) {
                if (closed || !epoch.current.current(ticket)) return;
                setMessage(e instanceof Error ? e.message : "Could not read research status.");
            }
            if (!closed) timer = setTimeout(()=>void poll(), 1500);
        }
        void poll();
        return ()=>{
            closed = true;
            abort.abort();
            clearTimeout(timer);
        };
    }, [
        jobId,
        acceptTurn
    ]);
    // Reopen a stored result exactly as computed, with the answer of the turn that produced it. Nothing is rerun.
    async function reopen(resultId, quiet = false, preserveResearchContext = false) {
        const ticket = ++reopenTicket.current;
        try {
            const response = await fetch(`/api/agent/results/${encodeURIComponent(resultId)}`, {
                cache: "no-store"
            });
            if (!response.ok) throw new Error("That stored result is no longer available.");
            const stored = await response.json();
            let producing = null;
            if (stored.turn_id) {
                const read = await fetch(`/api/agent/turns/${stored.turn_id}`, {
                    cache: "no-store"
                });
                if (read.ok) producing = await read.json();
            }
            if (ticket !== reopenTicket.current) return; // a newer reopen request wins
            setPrepared(stored.result);
            setShown(stored.result);
            setSaved(false);
            if (!preserveResearchContext) {
                setTurn(producing);
                setExplanation(producing?.interpretation ?? null);
                setRecord(null);
                setStructureIdentity({
                    drug: stored.result.configuration.drug,
                    target: stored.result.configuration.target
                });
            }
            if (!quiet) {
                setMessage(null);
                requestAnimationFrame(()=>document.getElementById(producing?.synthesis ? "answer" : "experiment")?.scrollIntoView({
                        block: "start",
                        behavior: "auto"
                    }));
            }
        } catch (e) {
            if (ticket === reopenTicket.current && !quiet) setMessage(e instanceof Error ? e.message : "Could not reopen that result.");
        }
    }
    const shownId = shown?.result_id ?? null;
    useEffect(()=>{
        if (shownId) try {
            localStorage.setItem(DISPLAYED, shownId);
        } catch  {}
    }, [
        shownId
    ]);
    // The history of whatever is displayed; refreshed when the displayed result changes.
    useEffect(()=>{
        if (!shownId) {
            setHistory(null);
            return;
        }
        const abort = new AbortController();
        fetch(`/api/agent/investigations/${encodeURIComponent(shownId)}`, {
            cache: "no-store",
            signal: abort.signal
        }).then(async (response)=>response.ok ? await response.json() : null).then((value)=>{
            if (!abort.signal.aborted) setHistory(value);
        }).catch(()=>{
            if (!abort.signal.aborted) setHistory(null);
        });
        return ()=>abort.abort();
    }, [
        shownId
    ]);
    const currentHistory = historyFor(history, shownId), branch = branchRequired(currentHistory, shownId);
    async function submitJob(mode, body) {
        if (busy || !backendAvailable || !researchAvailable) return;
        const ticket = epoch.current.next();
        activeTicket.current = ticket;
        activeJob.current = null;
        setJobId(null);
        setSubmitting(true);
        setMessage(null);
        setJob(null);
        setSaved(false);
        try {
            const response = await fetch(`/api/agent/jobs/${mode}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body),
                cache: "no-store"
            });
            const data = await response.json();
            if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Check the scientific request fields.");
            if (!epoch.current.current(ticket)) return;
            const next = data;
            activeJob.current = next.job_id;
            setJob(next);
            setJobId(next.job_id);
            requestAnimationFrame(()=>document.getElementById("investigation")?.scrollIntoView({
                    block: "start",
                    behavior: "auto"
                }));
            try {
                localStorage.setItem(STORAGE, next.job_id);
            } catch  {}
        } catch (e) {
            if (epoch.current.current(ticket)) setMessage(e instanceof Error ? e.message : "Research unavailable; previous curves remain visible.");
        } finally{
            if (epoch.current.current(ticket)) setSubmitting(false);
        }
    }
    function research(event) {
        event.preventDefault();
        if (busy || !backendAvailable || !researchAvailable || !text.trim() || !drug.trim()) return;
        setPrepared(null);
        setShown(null);
        setExplanation(null);
        setSelected(null);
        setSaved(false);
        setResearchOpen(false);
        setTurn(null);
        setRecord(null);
        try {
            localStorage.setItem(SCIENCE_REQUEST, JSON.stringify({
                drug_name: drug.trim(),
                target: target.trim() || null,
                route: route || null,
                original_hypothesis: text
            }));
        } catch  {}
        setStructureIdentity({
            drug,
            target
        });
        void submitJob("research", {
            request: {
                drug_name: drug.trim(),
                target: target.trim() || null,
                route: route || null,
                molecular_form: null,
                endpoint: "target_occupancy",
                original_hypothesis: text
            },
            structured_baseline: baseline,
            client_revision: 0
        });
    }
    function continueResearch(update) {
        if (!record) return;
        void submitJob("research", {
            request: record.preparation.request,
            preparation_id: record.preparation.preparation_id,
            researcher_update: update,
            structured_baseline: true,
            client_revision: 0
        });
    }
    async function loadPreparation() {
        if (!/^prep-[a-f0-9]{32}$/.test(resumeId.trim())) {
            setMessage("Enter a valid saved preparation ID.");
            return;
        }
        const ticket = epoch.current.next();
        activeTicket.current = ticket;
        activeJob.current = null;
        setJobId(null);
        setJob(null);
        try {
            const response = await fetch(`/api/preparations/${resumeId.trim()}`, {
                cache: "no-store"
            });
            if (!response.ok) throw new Error("Saved preparation unavailable. Check its ID.");
            const next = await response.json();
            if (epoch.current.current(ticket)) {
                setRecord(next);
                setMessage("Preparation restored. Review its current inputs and explicitly authorize continuation.");
            }
        } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not restore preparation.");
        }
    }
    async function reloadPreparation() {
        if (!record) return;
        const ticket = activeTicket.current;
        try {
            const response = await fetch(`/api/preparations/${record.preparation.preparation_id}`, {
                cache: "no-store"
            });
            if (!response.ok) throw new Error("Preparation could not be reloaded.");
            const next = await response.json();
            if (epoch.current.current(ticket)) {
                setRecord(next);
                setMessage("Latest preparation loaded. Review its current missing inputs before continuing.");
            }
        } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not reload preparation.");
        }
    }
    async function openDemo() {
        const ticket = epoch.current.next();
        activeTicket.current = ticket;
        activeJob.current = null;
        setJobId(null);
        setJob(null);
        setSubmitting(false);
        try {
            localStorage.removeItem(STORAGE);
            localStorage.removeItem(SCIENCE_REQUEST);
        } catch  {}
        try {
            const response = await fetch("/demo/trastuzumab-demo.json", {
                cache: "no-store"
            });
            if (!response.ok) throw new Error("Saved demo is unavailable.");
            const demo = await response.json();
            if (demo.result.result_id !== demo.interpretation.result_id || demo.experiment.experiment_id !== demo.result.configuration.experiment_id) throw new Error("Saved demo linkage is invalid.");
            if (!epoch.current.current(ticket)) return;
            setPrepared(demo.result);
            setShown(demo.result);
            setExplanation(demo.interpretation);
            setTurn(null);
            setRecord(null);
            setSaved(true);
            setMessage(null);
            setText(PRIMARY);
            setDrug("trastuzumab");
            setTarget("HER2");
            setRoute("iv_infusion");
            setBaseline(false);
            setAgentMode("edit");
            setEdit("");
            setStructureIdentity({
                drug: demo.experiment.drug,
                target: demo.experiment.target
            });
        } catch (e) {
            if (epoch.current.current(ticket)) setMessage(e instanceof Error ? e.message : "Could not load saved demo.");
        }
    }
    const onResult = useCallback((result, scenario, pending)=>{
        setShown(result);
        setSelected(scenario);
        setControlBusy(pending);
    }, []);
    useEffect(()=>{
        onResultSnapshot?.(shown, {
            savedReference: saved && shown?.result_id === prepared?.result_id
        });
    }, [
        shown,
        saved,
        prepared,
        onResultSnapshot
    ]);
    function submitEdit(event) {
        event.preventDefault();
        if (!shown || controlBusy) return;
        void submitJob("edits", {
            base_result_id: shown.result_id,
            base_experiment_id: shown.configuration.experiment_id,
            base_configuration_sha256: shown.configuration_hash,
            client_revision: shown.client_revision + 1,
            selected_scenario_id: selected,
            text: edit,
            branch
        });
    }
    // "Run this experiment": the proposal must belong to the displayed result; only its ID is sent to the server.
    function runProposal(proposal) {
        if (controlBusy) return;
        try {
            const body = proposalRequest(proposal, shown, branch);
            setEdit(proposal.edit_text);
            void submitJob("edits", body);
        } catch (e) {
            setMessage(e instanceof Error ? e.message : "This proposal cannot be run against the displayed curves.");
        }
    }
    const currentInterpretation = explanation?.result_id === shown?.result_id ? explanation : null;
    // The answer panel reports staleness itself; this note remains for results that have no written answer.
    const answer = answerState(turn, shown), staleExplanation = !!explanation && !currentInterpretation && answer === "none";
    const structure = structureKind(structureIdentity.drug, structureIdentity.target);
    // Open the molecular view on the measured residue pair. A fresh nonce makes repeated requests for the same pair work.
    const focusMeasurement = useCallback((card)=>{
        setStructureFocus({
            ...card.focus,
            label: card.id,
            nonce: Date.now() + Math.random()
        });
        window.history.replaceState(null, "", "#structure");
        window.dispatchEvent(new HashChangeEvent("hashchange"));
    }, []);
    return /*#__PURE__*/ _jsxs("div", {
        className: "hypothesim-workspace editorial-workspace science-experiment",
        "data-has-result": !!prepared,
        children: [
            /*#__PURE__*/ _jsxs("header", {
                className: "science-heading",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("p", {
                                className: "eyebrow",
                                children: prepared ? /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        "Experiment · ",
                                        visible.drug,
                                        " / ",
                                        visible.target
                                    ]
                                }) : "Hypothesis → Evidence → Simulation"
                            }),
                            /*#__PURE__*/ _jsx("h1", {
                                children: prepared ? visible.title : "New experiment"
                            }),
                            !prepared && /*#__PURE__*/ _jsx("p", {
                                className: "hypothesis-intro",
                                children: "Start with the hypothesis you want to test."
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "science-heading-actions",
                        children: [
                            toolbar,
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "quiet-button",
                                onClick: ()=>void openDemo(),
                                disabled: !!busy,
                                children: "Load reference"
                            })
                        ]
                    })
                ]
            }),
            prepared && /*#__PURE__*/ _jsxs("div", {
                className: "study-context",
                children: [
                    /*#__PURE__*/ _jsx("span", {
                        className: "study-state-dot"
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        children: saved && shown?.result_id === prepared?.result_id ? 'Saved reference' : busy ? 'Agent running' : 'Simulation result'
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "scientific-scene",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "hypothesis-glass-art",
                        "aria-hidden": "true",
                        hidden: !!prepared || !!busy || !!turn || !!record || !!message,
                        children: [
                            /*#__PURE__*/ _jsx("i", {}),
                            /*#__PURE__*/ _jsx("i", {}),
                            /*#__PURE__*/ _jsx("i", {})
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "visual-stage",
                        hidden: !prepared && !busy && !record && !turn && !message,
                        children: [
                            prepared ? /*#__PURE__*/ _jsx(PlotPreview, {
                                initialExperiment: prepared?.configuration ?? fallbackExperiment,
                                initialResult: prepared,
                                onResultChange: onResult,
                                editingLocked: !!busy || !backendAvailable,
                                interpretation: currentInterpretation,
                                answerShown: answer === 'current',
                                turn: turn,
                                structure: structure !== "unavailable" ? /*#__PURE__*/ _jsx(VisualizationBoundary, {
                                    label: "Experimental structure",
                                    children: /*#__PURE__*/ _jsx(StructureViewer, {
                                        kind: structure,
                                        focusRequest: structureFocus
                                    })
                                }, structure) : /*#__PURE__*/ _jsxs("section", {
                                    id: "structure",
                                    className: "structure-panel",
                                    children: [
                                        /*#__PURE__*/ _jsx("h2", {
                                            children: "Structure unavailable"
                                        }),
                                        /*#__PURE__*/ _jsxs("p", {
                                            children: [
                                                "No verified deposited complex is available for ",
                                                structureIdentity.drug,
                                                " → ",
                                                structureIdentity.target || 'unspecified target',
                                                ". A compatible numerical experiment can still run without one."
                                            ]
                                        })
                                    ]
                                })
                            }) : /*#__PURE__*/ _jsxs("section", {
                                className: "research-waiting",
                                "aria-live": "polite",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: busy ? "research-orbit is-running" : "research-orbit",
                                        "aria-hidden": "true",
                                        children: [
                                            /*#__PURE__*/ _jsx("i", {}),
                                            /*#__PURE__*/ _jsx("i", {}),
                                            /*#__PURE__*/ _jsx("i", {})
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("h2", {
                                        children: busy ? "Research in progress" : record ? "Review the missing inputs" : message ? "The experiment needs attention" : "Research prepared"
                                    }),
                                    /*#__PURE__*/ _jsx("p", {
                                        children: busy ? "The agent is working from your hypothesis." : record ? "Complete the requested inputs to continue." : "Results will appear here when a simulation is accepted."
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx(ScientificAnswer, {
                                turn: turn,
                                shown: shown,
                                viewer: structure,
                                onFocusMeasurement: focusMeasurement
                            }),
                            shown && /*#__PURE__*/ _jsxs("details", {
                                className: "science-follow-ups",
                                children: [
                                    /*#__PURE__*/ _jsx("summary", {
                                        children: "Follow-up experiments"
                                    }),
                                    /*#__PURE__*/ _jsx(NextExperimentProposals, {
                                        shown: proposalResultForTurn(turn, shown),
                                        busy: !!busy || controlBusy || !researchAvailable || !backendAvailable,
                                        onRun: runProposal
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx(InvestigationHistoryPanel, {
                                history: currentHistory,
                                shownId: shownId,
                                busy: !!busy || controlBusy,
                                branch: branch,
                                onReopen: (id)=>void reopen(id)
                            }),
                            shown && /*#__PURE__*/ _jsx(ShareExperiment, {
                                resultId: shownId,
                                defaultTitle: history?.question ?? text,
                                busy: !!busy || controlBusy
                            }),
                            /*#__PURE__*/ _jsxs("details", {
                                className: "science-records",
                                children: [
                                    /*#__PURE__*/ _jsx("summary", {
                                        children: "Papers and sources"
                                    }),
                                    /*#__PURE__*/ _jsx(ResearchPaperReview, {
                                        papers: turn?.research_papers ?? []
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("aside", {
                        className: prepared ? "agent-desk" : "agent-desk hypothesis-desk",
                        id: "research",
                        "aria-label": "Research agent",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "agent-desk-heading",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "agent-mark",
                                        "aria-hidden": "true",
                                        children: "h."
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        children: [
                                            /*#__PURE__*/ _jsx("h2", {
                                                children: prepared ? "Research agent" : "Your hypothesis"
                                            }),
                                            /*#__PURE__*/ _jsx("p", {
                                                children: busy ? 'Working through the scientific tools' : researchAvailable ? 'Ready' : 'Provider not connected'
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: 'agent-presence ' + (busy ? 'working' : '')
                                    })
                                ]
                            }),
                            prepared && /*#__PURE__*/ _jsx("div", {
                                className: "agent-mode-tabs",
                                role: "tablist",
                                "aria-label": "Agent request type",
                                children: [
                                    [
                                        'edit',
                                        'Refine experiment'
                                    ],
                                    [
                                        'research',
                                        'New hypothesis'
                                    ]
                                ].map(([id, label])=>/*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        role: "tab",
                                        id: 'agent-tab-' + id,
                                        "aria-selected": agentMode === id,
                                        "aria-controls": 'agent-panel-' + id,
                                        tabIndex: agentMode === id ? 0 : -1,
                                        onClick: ()=>setAgentMode(id),
                                        onKeyDown: (event)=>{
                                            if ([
                                                'ArrowLeft',
                                                'ArrowRight',
                                                'Home',
                                                'End'
                                            ].includes(event.key)) {
                                                event.preventDefault();
                                                const next = event.key === 'Home' ? 'edit' : event.key === 'End' ? 'research' : agentMode === 'edit' ? 'research' : 'edit';
                                                setAgentMode(next);
                                                document.getElementById('agent-tab-' + next)?.focus();
                                            }
                                        },
                                        children: label
                                    }, id))
                            }),
                            !researchAvailable && /*#__PURE__*/ _jsxs("div", {
                                className: "agent-connection-note",
                                children: [
                                    /*#__PURE__*/ _jsx("p", {
                                        children: "Connect an NVIDIA key to run the research agent."
                                    }),
                                    /*#__PURE__*/ _jsx("a", {
                                        href: "/local-setup",
                                        children: "Connect the agent →"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                id: "agent-panel-edit",
                                role: "tabpanel",
                                "aria-labelledby": "agent-tab-edit",
                                hidden: !prepared || agentMode !== 'edit',
                                children: [
                                    /*#__PURE__*/ _jsxs("form", {
                                        onSubmit: submitEdit,
                                        id: "revise",
                                        className: "agent-composer",
                                        children: [
                                            /*#__PURE__*/ _jsx("label", {
                                                htmlFor: "experiment-edit",
                                                children: "Change the experiment"
                                            }),
                                            /*#__PURE__*/ _jsx("textarea", {
                                                id: "experiment-edit",
                                                rows: 4,
                                                required: true,
                                                maxLength: 12000,
                                                value: edit,
                                                onChange: (event)=>setEdit(event.target.value),
                                                placeholder: "Compare twofold and fivefold affinity improvement at fixed association rate",
                                                disabled: !!busy
                                            }),
                                            /*#__PURE__*/ _jsxs("label", {
                                                className: "agent-alternative",
                                                children: [
                                                    "Editing alternative",
                                                    /*#__PURE__*/ _jsx("select", {
                                                        "aria-label": "Agent edit alternative",
                                                        value: selected ?? visible.scenarios[1]?.scenario_id ?? '',
                                                        onChange: (event)=>window.dispatchEvent(new CustomEvent('hypothesim:select-scenario', {
                                                                detail: event.target.value
                                                            })),
                                                        children: visible.scenarios.slice(1).map((s)=>/*#__PURE__*/ _jsx("option", {
                                                                value: s.scenario_id,
                                                                children: s.label
                                                            }, s.scenario_id))
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("small", {
                                                children: "The baseline stays protected."
                                            }),
                                            /*#__PURE__*/ _jsxs("button", {
                                                className: "primary-button",
                                                disabled: !!busy || controlBusy || !shown || !researchAvailable || !backendAvailable,
                                                children: [
                                                    busy ? 'Running the agent…' : 'Update and simulate',
                                                    /*#__PURE__*/ _jsx("span", {
                                                        "aria-hidden": "true",
                                                        children: "↗"
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "agent-suggestions",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                children: "Suggestions"
                                            }),
                                            [
                                                'Run this comparison for 120 days',
                                                'Double the dose in the affinity alternative',
                                                'Compare twofold and fivefold affinity improvement at fixed association rate'
                                            ].map((prompt)=>/*#__PURE__*/ _jsxs("button", {
                                                    type: "button",
                                                    disabled: !!busy,
                                                    onClick: ()=>{
                                                        setEdit(prompt);
                                                        document.getElementById('experiment-edit')?.focus();
                                                    },
                                                    children: [
                                                        prompt.replace(' improvement at fixed association rate', ''),
                                                        /*#__PURE__*/ _jsx("span", {
                                                            "aria-hidden": "true",
                                                            children: "↗"
                                                        })
                                                    ]
                                                }, prompt))
                                        ]
                                    }),
                                    turn?.applied_changes?.length ? /*#__PURE__*/ _jsxs("div", {
                                        className: "accepted-changes",
                                        children: [
                                            /*#__PURE__*/ _jsx("h3", {
                                                children: "Applied changes"
                                            }),
                                            /*#__PURE__*/ _jsx("ul", {
                                                children: turn.applied_changes.map((change)=>/*#__PURE__*/ _jsx("li", {
                                                        children: change
                                                    }, change))
                                            })
                                        ]
                                    }) : null
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                id: "agent-panel-research",
                                role: prepared ? "tabpanel" : undefined,
                                "aria-labelledby": prepared ? "agent-tab-research" : undefined,
                                hidden: !!prepared && agentMode !== 'research',
                                children: [
                                    /*#__PURE__*/ _jsxs("form", {
                                        onSubmit: research,
                                        className: "agent-composer",
                                        children: [
                                            /*#__PURE__*/ _jsx("label", {
                                                htmlFor: "scientific-hypothesis",
                                                children: "Hypothesis"
                                            }),
                                            /*#__PURE__*/ _jsx("textarea", {
                                                id: "scientific-hypothesis",
                                                rows: 5,
                                                placeholder: "What do you predict, and which conditions would you like to compare?",
                                                required: true,
                                                maxLength: 12000,
                                                value: text,
                                                onChange: (event)=>setText(event.target.value),
                                                disabled: !!busy
                                            }),
                                            /*#__PURE__*/ _jsxs("fieldset", {
                                                className: "hypothesis-system",
                                                disabled: !!busy,
                                                children: [
                                                    /*#__PURE__*/ _jsx("legend", {
                                                        children: "Biological system"
                                                    }),
                                                    /*#__PURE__*/ _jsxs("div", {
                                                        className: "hypothesis-system-names",
                                                        children: [
                                                            /*#__PURE__*/ _jsxs("label", {
                                                                children: [
                                                                    "Drug or antibody",
                                                                    /*#__PURE__*/ _jsx("input", {
                                                                        placeholder: "Drug name",
                                                                        required: true,
                                                                        maxLength: 200,
                                                                        value: drug,
                                                                        onChange: (event)=>setDrug(event.target.value)
                                                                    })
                                                                ]
                                                            }),
                                                            /*#__PURE__*/ _jsxs("label", {
                                                                children: [
                                                                    "Target ",
                                                                    /*#__PURE__*/ _jsx("span", {
                                                                        className: "field-optional",
                                                                        children: "(optional)"
                                                                    }),
                                                                    /*#__PURE__*/ _jsx("input", {
                                                                        placeholder: "Target name",
                                                                        value: target,
                                                                        onChange: (event)=>setTarget(event.target.value)
                                                                    })
                                                                ]
                                                            })
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("details", {
                                                        className: "agent-system-fields",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("summary", {
                                                                children: "Experimental options"
                                                            }),
                                                            /*#__PURE__*/ _jsxs("label", {
                                                                children: [
                                                                    "Administration route",
                                                                    /*#__PURE__*/ _jsxs("select", {
                                                                        value: route,
                                                                        onChange: (event)=>setRoute(event.target.value),
                                                                        children: [
                                                                            /*#__PURE__*/ _jsx("option", {
                                                                                value: "",
                                                                                children: "Ask the agent"
                                                                            }),
                                                                            /*#__PURE__*/ _jsx("option", {
                                                                                value: "iv_infusion",
                                                                                children: "IV infusion"
                                                                            }),
                                                                            /*#__PURE__*/ _jsx("option", {
                                                                                value: "hypothetical_iv_bolus",
                                                                                children: "Hypothetical IV bolus"
                                                                            }),
                                                                            /*#__PURE__*/ _jsx("option", {
                                                                                value: "oral",
                                                                                children: "Oral · model assessment"
                                                                            }),
                                                                            /*#__PURE__*/ _jsx("option", {
                                                                                value: "subcutaneous",
                                                                                children: "Subcutaneous · model assessment"
                                                                            })
                                                                        ]
                                                                    })
                                                                ]
                                                            }),
                                                            /*#__PURE__*/ _jsxs("label", {
                                                                className: "agent-checkbox",
                                                                children: [
                                                                    /*#__PURE__*/ _jsx("input", {
                                                                        type: "checkbox",
                                                                        checked: baseline,
                                                                        onChange: (event)=>setBaseline(event.target.checked)
                                                                    }),
                                                                    "Prepare a baseline with compatible evidence."
                                                                ]
                                                            })
                                                        ]
                                                    })
                                                ]
                                            }),
                                            researchRouteNotice(drug, route) && /*#__PURE__*/ _jsx("p", {
                                                className: "scope-note",
                                                children: researchRouteNotice(drug, route)
                                            }),
                                            /*#__PURE__*/ _jsx(SignInPrompt, {
                                                action: "run the research agent"
                                            }),
                                            /*#__PURE__*/ _jsxs("button", {
                                                className: "primary-button",
                                                disabled: !!busy || !researchAvailable || !backendAvailable || !text.trim() || !drug.trim(),
                                                children: [
                                                    busy ? 'Researching…' : 'Research and simulate',
                                                    /*#__PURE__*/ _jsx("span", {
                                                        "aria-hidden": "true",
                                                        children: "↗"
                                                    })
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "agent-suggestions demo-example",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                children: "Examples"
                                            }),
                                            /*#__PURE__*/ _jsxs("button", {
                                                type: "button",
                                                disabled: !!busy,
                                                onClick: ()=>{
                                                    setText(PRIMARY);
                                                    setDrug("trastuzumab");
                                                    setTarget("HER2");
                                                    setRoute("iv_infusion");
                                                },
                                                children: [
                                                    "Use the trastuzumab example",
                                                    /*#__PURE__*/ _jsx("span", {
                                                        "aria-hidden": "true",
                                                        children: "↗"
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("button", {
                                                type: "button",
                                                disabled: !!busy,
                                                onClick: ()=>{
                                                    setText("Could a single intravenous dose of imatinib keep ABL1 kinase occupied, and what evidence would we need to simulate it?");
                                                    setDrug("imatinib");
                                                    setTarget("ABL1");
                                                    setRoute("hypothetical_iv_bolus");
                                                },
                                                children: [
                                                    "Use the imatinib example",
                                                    /*#__PURE__*/ _jsx("span", {
                                                        "aria-hidden": "true",
                                                        children: "↗"
                                                    })
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            }),
                            record || turn?.questions?.length || staleExplanation ? /*#__PURE__*/ _jsxs("section", {
                                className: "agent-continuation",
                                "aria-label": "Research continuation",
                                children: [
                                    turn?.questions?.length ? /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            /*#__PURE__*/ _jsx("h3", {
                                                children: "What is needed next"
                                            }),
                                            /*#__PURE__*/ _jsx("ul", {
                                                children: turn.questions.map((question)=>/*#__PURE__*/ _jsx("li", {
                                                        children: question
                                                    }, question))
                                            })
                                        ]
                                    }) : null,
                                    record && /*#__PURE__*/ _jsx(PreparationAnswers, {
                                        record: record,
                                        busy: !!busy || !researchAvailable,
                                        onContinue: continueResearch,
                                        onReload: ()=>void reloadPreparation()
                                    }, `${record.preparation.preparation_id}:${record.preparation.revision}`),
                                    " ",
                                    staleExplanation && /*#__PURE__*/ _jsx("p", {
                                        className: "scope-note",
                                        children: "The previous explanation describes an earlier result. Ask the agent to interpret the updated comparison."
                                    })
                                ]
                            }) : null,
                            (busy || job || message) && /*#__PURE__*/ _jsxs("details", {
                                className: "agent-activity",
                                open: !!busy || undefined,
                                children: [
                                    /*#__PURE__*/ _jsxs("summary", {
                                        children: [
                                            "Agent activity",
                                            /*#__PURE__*/ _jsx("span", {
                                                children: busy ? 'Running' : job?.status === 'completed' ? 'Completed' : job?.status === 'failed' ? 'Needs attention' : 'No active run'
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx(InvestigationPanel, {
                                        job: job,
                                        submitting: submitting,
                                        saved: saved,
                                        displayedResult: shown,
                                        config: visible,
                                        message: message,
                                        viewer: structure,
                                        onFocusMeasurement: focusMeasurement
                                    })
                                ]
                            }),
                            requestHistory.length > 0 && /*#__PURE__*/ _jsxs("details", {
                                className: "agent-request-history",
                                children: [
                                    /*#__PURE__*/ _jsxs("summary", {
                                        children: [
                                            "Requests this session ",
                                            /*#__PURE__*/ _jsx("span", {
                                                children: requestHistory.length
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("ol", {
                                        children: requestHistory.map((item)=>/*#__PURE__*/ _jsxs("li", {
                                                children: [
                                                    /*#__PURE__*/ _jsx("span", {
                                                        children: item.status
                                                    }),
                                                    /*#__PURE__*/ _jsx("p", {
                                                        children: item.text
                                                    })
                                                ]
                                            }, item.id))
                                    })
                                ]
                            }),
                            message && !job && /*#__PURE__*/ _jsx("p", {
                                role: "alert",
                                children: message
                            }),
                            /*#__PURE__*/ _jsxs("details", {
                                className: "agent-advanced",
                                children: [
                                    /*#__PURE__*/ _jsx("summary", {
                                        children: "Drug support and preparation"
                                    }),
                                    /*#__PURE__*/ _jsx(DrugSupportPanel, {}),
                                    /*#__PURE__*/ _jsxs("label", {
                                        children: [
                                            "Saved preparation ID",
                                            /*#__PURE__*/ _jsx("input", {
                                                value: resumeId,
                                                onChange: (event)=>setResumeId(event.target.value),
                                                placeholder: "prep-…"
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        className: "quiet-button",
                                        disabled: !!busy || !backendAvailable,
                                        onClick: ()=>void loadPreparation(),
                                        children: "Resume preparation"
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        className: "quiet-button",
                                        disabled: !!busy || !backendAvailable,
                                        onClick: ()=>{
                                            let id;
                                            try {
                                                id = localStorage.getItem(DISPLAYED);
                                            } catch  {}
                                            if (id) void reopen(id);
                                            else setMessage("No previous result is saved in this browser.");
                                        },
                                        children: "Reopen last result"
                                    })
                                ]
                            }),
                            onLegacy && /*#__PURE__*/ _jsx("button", {
                                className: "manual-model-link",
                                type: "button",
                                onClick: onLegacy,
                                children: "Open manual PK/PD and assay models →"
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
