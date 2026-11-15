"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Live agent-workflow graph (5C.3). A node canvas: the question flows into the AI agent, the agent calls its
 * research tools (dashed links) and its results branch out to model inputs, simulation, structure and the
 * grounded answer. Every node state, edge animation and inspector value is drawn from the job's recorded
 * execution events; packets move only along links whose tools are actually running or returning results.
 */ import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { replayJob, replaySchedule, workflowModel, WORKFLOW_STAGES } from "../lib/agent-workflow.js";
import { EDGES, NODES, VIEW, graphState } from "../lib/workflow-graph.js";
import { scenarioColor } from "../lib/plot-spec.js";
import { AgentIcon, BracesIcon, CheckIcon, CrossIcon, DocIcon, FitIcon, StageIcon, ZoomIcon } from "./WorkflowIcons.jsx";
const STATUS = {
    recorded: "Recorded run playing",
    replaying: "Replaying recorded run",
    starting: "Starting agent",
    queued: "Waiting for an agent slot",
    running: "Agent working",
    completed: "Investigation complete",
    needs_inputs: "Needs researcher input",
    unsupported: "Outside supported models",
    failed: "Run stopped",
    invalid: "Record could not be verified"
};
const NODE_OF_STAGE = {
    question: "prep",
    search: "search",
    reading: "reading",
    extraction: "extraction",
    model: "model",
    simulation: "simulation",
    structure: "structure",
    answer: "answer"
};
export function AgentWorkflow({ job, submitting, question, replay, onClose, onViewResults }) {
    const [now, setNow] = useState(()=>Date.now());
    const [shown, setShown] = useState(Number.MAX_SAFE_INTEGER);
    const [replayKey, setReplayKey] = useState(0);
    const [picked, setPicked] = useState(null);
    const [zoom, setZoom] = useState(1);
    const total = job?.execution_events?.length ?? 0;
    // Demo mode replays a recorded live run on the server; say so instead of implying a live model call.
    const recorded = !!job?.events?.some((event)=>event.startsWith("Replaying recorded agent run"));
    // Presentation pacing: events arrive in polling bursts, so reveal them one by one with a minimum dwell,
    // letting every tool call visibly run before its outcome appears. Only the timing of display changes.
    const [paced, setPaced] = useState(0);
    const events = job?.execution_events ?? [];
    useEffect(()=>{
        setPaced(0);
    }, [
        job?.execution_run_id
    ]);
    useEffect(()=>{
        if (replay || paced >= events.length) return;
        const next = events[paced];
        const dwell = next?.state === "started" ? 160 : next?.kind === "run" ? 220 : 650;
        const timer = setTimeout(()=>setPaced((count)=>Math.min(events.length, count + 1)), dwell);
        return ()=>clearTimeout(timer);
    }, [
        replay,
        paced,
        events.length
    ]);
    useEffect(()=>{
        if (!replay || !job?.execution_events?.length) {
            setShown(Number.MAX_SAFE_INTEGER);
            return;
        }
        const schedule = replaySchedule(job.execution_events);
        setShown(0);
        setPicked(null);
        const timers = schedule.map((ms, i)=>setTimeout(()=>setShown(i + 1), ms));
        return ()=>timers.forEach(clearTimeout);
    }, [
        replay,
        job?.execution_run_id,
        replayKey
    ]);
    const visibleJob = useMemo(()=>!job ? job : replay ? shown < total ? replayJob(job, shown) : job : paced < total ? replayJob(job, paced) : job, [
        job,
        replay,
        shown,
        total,
        paced
    ]);
    const model = useMemo(()=>workflowModel(visibleJob, now), [
        visibleJob,
        now
    ]);
    const live = !replay && (submitting || job?.status === "queued" || job?.status === "running");
    const replaying = replay && shown < total;
    const catchingUp = !replay && paced < total;
    const running = live || replaying || catchingUp;
    useEffect(()=>{
        if (!live) return;
        const t = setInterval(()=>setNow(Date.now()), 1000);
        return ()=>clearInterval(t);
    }, [
        live
    ]);
    useEffect(()=>{
        const key = (e)=>{
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", key);
        return ()=>window.removeEventListener("keydown", key);
    }, [
        onClose
    ]);
    const logRef = useRef(null);
    useEffect(()=>{
        const log = logRef.current;
        if (log) log.scrollTop = log.scrollHeight;
    }, [
        model.log.length
    ]);
    const status = submitting && !job ? "starting" : replaying ? "replaying" : recorded && running ? "recorded" : model.status;
    const finished = !running;
    const { nodeState, edgeMode } = graphState(model.stages, running, model.active?.stage ?? null, [
        "failed",
        "invalid"
    ].includes(status));
    // The inspector follows the agent unless the viewer picked a node.
    const lastDone = [
        ...model.stages
    ].reverse().find((s)=>s.state === "done" || s.state === "warning");
    // While the agent composes between tool calls, show its latest finished work rather than an empty panel.
    const followed = model.active ? NODE_OF_STAGE[model.active.stage] : finished && model.synthesis ? "answer" : lastDone ? NODE_OF_STAGE[lastDone.id] : "agent";
    const selected = picked ?? followed;
    const activeStage = model.active ? WORKFLOW_STAGES.find((s)=>s.id === model.active.stage) : null;
    const metricOf = (id)=>id === "question" ? "submitted" : id === "agent" ? `${model.toolCalls} tool calls` : model.stages.find((s)=>s.id === NODES.find((n)=>n.id === id).stage)?.metric ?? "";
    const [mounted, setMounted] = useState(false);
    useEffect(()=>setMounted(true), []);
    if (!mounted) return null;
    return /*#__PURE__*/ createPortal(/*#__PURE__*/ _jsx("div", {
        className: "workflow-overlay",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Agent workflow",
        children: /*#__PURE__*/ _jsxs("div", {
            className: "wf-shell",
            children: [
                /*#__PURE__*/ _jsxs("header", {
                    className: "wf-header",
                    children: [
                        /*#__PURE__*/ _jsxs("div", {
                            className: "wf-title",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "wf-tabs",
                                    role: "presentation",
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            "data-on": !replay && !recorded,
                                            children: "Live"
                                        }),
                                        /*#__PURE__*/ _jsx("span", {
                                            "data-on": replay || recorded,
                                            children: recorded && !replay ? "Recorded" : "Replay"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "wf-eyebrow",
                                            children: recorded ? "Recorded agent run · NVIDIA Nemotron + scientific tools" : "Agentic workflow · NVIDIA Nemotron + scientific tools"
                                        }),
                                        /*#__PURE__*/ _jsx("h2", {
                                            children: question || "Scientific investigation"
                                        })
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("div", {
                            className: "wf-stats",
                            children: [
                                /*#__PURE__*/ _jsxs("span", {
                                    className: "wf-status",
                                    "data-status": status,
                                    children: [
                                        running && /*#__PURE__*/ _jsx("span", {
                                            className: "wf-pulse"
                                        }),
                                        STATUS[status] ?? status
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("span", {
                                    className: "wf-stat",
                                    children: [
                                        /*#__PURE__*/ _jsx("strong", {
                                            children: Math.floor(model.elapsed)
                                        }),
                                        "s"
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("span", {
                                    className: "wf-stat",
                                    children: [
                                        /*#__PURE__*/ _jsx("strong", {
                                            children: model.toolCalls
                                        }),
                                        "tool calls"
                                    ]
                                }),
                                /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "wf-icon-button",
                                    onClick: onClose,
                                    "aria-label": "Close workflow view",
                                    children: "✕"
                                })
                            ]
                        })
                    ]
                }),
                /*#__PURE__*/ _jsxs("div", {
                    className: "wf-main",
                    children: [
                        /*#__PURE__*/ _jsxs("div", {
                            className: "wf-canvas",
                            children: [
                                /*#__PURE__*/ _jsx("div", {
                                    className: "wf-now",
                                    children: activeStage ? /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "wf-pulse"
                                            }),
                                            /*#__PURE__*/ _jsx("b", {
                                                children: model.active.label
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                children: activeStage.doing
                                            })
                                        ]
                                    }) : running ? /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "wf-pulse thinking"
                                            }),
                                            /*#__PURE__*/ _jsx("b", {
                                                children: "Agent reasoning"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                children: "choosing the next tool from what it has observed"
                                            })
                                        ]
                                    }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            /*#__PURE__*/ _jsx(CheckIcon, {
                                                size: 12
                                            }),
                                            /*#__PURE__*/ _jsx("b", {
                                                children: status === "completed" ? "Run complete" : "Run ended"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                children: "every node reflects a recorded tool outcome"
                                            })
                                        ]
                                    })
                                }),
                                /*#__PURE__*/ _jsx("div", {
                                    className: "wf-scroll",
                                    children: /*#__PURE__*/ _jsxs("svg", {
                                        className: "wf-graph",
                                        viewBox: `0 0 ${VIEW.width} ${VIEW.height}`,
                                        style: {
                                            "--zoom": zoom
                                        },
                                        role: "img",
                                        "aria-label": "Agent workflow graph",
                                        children: [
                                            /*#__PURE__*/ _jsxs("defs", {
                                                children: [
                                                    /*#__PURE__*/ _jsxs("filter", {
                                                        id: "wf-glow",
                                                        x: "-50%",
                                                        y: "-50%",
                                                        width: "200%",
                                                        height: "200%",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("feGaussianBlur", {
                                                                stdDeviation: "6",
                                                                result: "b"
                                                            }),
                                                            /*#__PURE__*/ _jsxs("feMerge", {
                                                                children: [
                                                                    /*#__PURE__*/ _jsx("feMergeNode", {
                                                                        in: "b"
                                                                    }),
                                                                    /*#__PURE__*/ _jsx("feMergeNode", {
                                                                        in: "SourceGraphic"
                                                                    })
                                                                ]
                                                            })
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("linearGradient", {
                                                        id: "wf-agent-fill",
                                                        x1: "0",
                                                        x2: "1",
                                                        children: [
                                                            /*#__PURE__*/ _jsx("stop", {
                                                                offset: "0",
                                                                stopColor: "#0f2230"
                                                            }),
                                                            /*#__PURE__*/ _jsx("stop", {
                                                                offset: "1",
                                                                stopColor: "#11263a"
                                                            })
                                                        ]
                                                    })
                                                ]
                                            }),
                                            EDGES.map((edge)=>/*#__PURE__*/ _jsx(Edge, {
                                                    d: edge.d,
                                                    dashed: edge.dashed,
                                                    mode: edgeMode.get(edge.id) ?? "idle"
                                                }, edge.id)),
                                            NODES.map((n)=>/*#__PURE__*/ _jsx(Node, {
                                                    id: n.id,
                                                    label: n.label,
                                                    x: n.x,
                                                    y: n.y,
                                                    shape: n.shape,
                                                    color: n.color,
                                                    state: nodeState.get(n.id) ?? "waiting",
                                                    metric: metricOf(n.id),
                                                    selected: selected === n.id,
                                                    sub: n.id === "agent" ? model.active?.label ?? (running ? "Reasoning…" : status === "completed" ? "Finished" : "Stopped") : null,
                                                    count: n.id === "agent" ? model.toolCalls : n.id === "reading" ? model.papers.length : n.id === "extraction" ? model.values.length : null,
                                                    onSelect: ()=>setPicked((p)=>p === n.id ? null : n.id)
                                                }, n.id))
                                        ]
                                    })
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "wf-zoom",
                                    role: "group",
                                    "aria-label": "Zoom",
                                    children: [
                                        /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            onClick: ()=>setZoom((z)=>Math.min(1.8, +(z + 0.2).toFixed(1))),
                                            "aria-label": "Zoom in",
                                            children: /*#__PURE__*/ _jsx(ZoomIcon, {
                                                dir: "in"
                                            })
                                        }),
                                        /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            onClick: ()=>setZoom((z)=>Math.max(0.8, +(z - 0.2).toFixed(1))),
                                            "aria-label": "Zoom out",
                                            children: /*#__PURE__*/ _jsx(ZoomIcon, {
                                                dir: "out"
                                            })
                                        }),
                                        /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            onClick: ()=>setZoom(1),
                                            "aria-label": "Fit graph",
                                            children: /*#__PURE__*/ _jsx(FitIcon, {})
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("ul", {
                                    className: "wf-legend",
                                    "aria-label": "Legend",
                                    children: [
                                        /*#__PURE__*/ _jsxs("li", {
                                            children: [
                                                /*#__PURE__*/ _jsx("i", {
                                                    className: "done"
                                                }),
                                                "completed"
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("li", {
                                            children: [
                                                /*#__PURE__*/ _jsx("i", {
                                                    className: "active"
                                                }),
                                                "running"
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("li", {
                                            children: [
                                                /*#__PURE__*/ _jsx("i", {
                                                    className: "warn"
                                                }),
                                                "rejected / retried"
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("li", {
                                            children: [
                                                /*#__PURE__*/ _jsx("i", {
                                                    className: "dash"
                                                }),
                                                "tool call"
                                            ]
                                        })
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("aside", {
                            className: "wf-inspector",
                            "aria-label": "Node details",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "wf-inspector-head",
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "wf-dot",
                                            style: {
                                                background: NODES.find((n)=>n.id === selected).color
                                            }
                                        }),
                                        /*#__PURE__*/ _jsx("strong", {
                                            children: NODES.find((n)=>n.id === selected).label
                                        }),
                                        /*#__PURE__*/ _jsx("em", {
                                            "data-state": nodeState.get(selected),
                                            children: stateWord(nodeState.get(selected))
                                        }),
                                        picked && /*#__PURE__*/ _jsx("button", {
                                            type: "button",
                                            onClick: ()=>setPicked(null),
                                            children: "follow agent"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsx(Inspector, {
                                    node: selected,
                                    model: model,
                                    question: question,
                                    running: running
                                }),
                                /*#__PURE__*/ _jsx(RunSoFar, {
                                    node: selected,
                                    model: model
                                })
                            ]
                        })
                    ]
                }),
                /*#__PURE__*/ _jsxs("section", {
                    className: "wf-log",
                    "aria-label": "Tool log",
                    children: [
                        /*#__PURE__*/ _jsxs("h3", {
                            children: [
                                "Execution log ",
                                /*#__PURE__*/ _jsx("small", {
                                    children: model.runId ? `run ${model.runId.slice(4, 12)}` : ""
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("ol", {
                            ref: logRef,
                            children: [
                                model.log.map((row)=>/*#__PURE__*/ _jsxs("li", {
                                        "data-state": row.state,
                                        children: [
                                            /*#__PURE__*/ _jsx(StageIcon, {
                                                id: row.stage,
                                                size: 13
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "log-label",
                                                children: row.label
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "log-detail",
                                                children: row.detail ?? ""
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "log-state",
                                                children: row.state === "started" ? "running" : row.state.replaceAll("_", " ")
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "log-time",
                                                children: row.seconds != null ? `${row.seconds.toFixed(1)}s` : "…"
                                            })
                                        ]
                                    }, row.id)),
                                !model.log.length && /*#__PURE__*/ _jsx("li", {
                                    className: "log-empty",
                                    children: submitting ? "Sending the question to the agent…" : "No tool calls yet."
                                })
                            ]
                        })
                    ]
                }),
                /*#__PURE__*/ _jsxs("footer", {
                    className: "wf-footer",
                    children: [
                        /*#__PURE__*/ _jsx("p", {
                            children: "Every node, link and value is a recorded tool call from this run, not a scripted animation. Paper values are candidates checked against their source passage; model inputs show their provenance."
                        }),
                        /*#__PURE__*/ _jsxs("div", {
                            children: [
                                replay && /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "wf-button ghost",
                                    onClick: ()=>setReplayKey((k)=>k + 1),
                                    children: "Replay again"
                                }),
                                /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "wf-button ghost",
                                    onClick: onClose,
                                    children: live ? "Continue in background" : "Close"
                                }),
                                finished && /*#__PURE__*/ _jsx("button", {
                                    type: "button",
                                    className: "wf-button",
                                    onClick: onViewResults,
                                    children: "View results →"
                                })
                            ]
                        })
                    ]
                })
            ]
        })
    }), document.body);
}
const stateWord = (s)=>({
        waiting: "waiting",
        active: "running",
        thinking: "reasoning",
        done: "completed",
        warning: "completed with rejections",
        failed: "failed",
        skipped: "not run"
    })[s ?? "waiting"];
function Edge({ d, dashed, mode }) {
    const moving = mode === "flow" || mode === "call" || mode === "return";
    const reverse = mode === "call"; // dashed paths run tool → agent; a call travels agent → tool
    return /*#__PURE__*/ _jsxs("g", {
        className: "wf-edge",
        "data-mode": mode,
        "data-dashed": dashed,
        children: [
            /*#__PURE__*/ _jsx("path", {
                className: "wf-edge-track",
                d: d
            }),
            /*#__PURE__*/ _jsx("path", {
                className: "wf-edge-line",
                d: d
            }),
            moving && [
                0,
                1
            ].map((i)=>/*#__PURE__*/ _jsx("circle", {
                    className: "wf-packet",
                    r: 2.6,
                    children: /*#__PURE__*/ _jsx("animateMotion", {
                        dur: dashed ? "1.6s" : "2.2s",
                        begin: `${i * (dashed ? 0.8 : 1.1)}s`,
                        repeatCount: "indefinite",
                        path: d,
                        ...reverse ? {
                            keyPoints: "1;0",
                            keyTimes: "0;1",
                            calcMode: "linear"
                        } : {}
                    })
                }, i))
        ]
    });
}
function NodeIcon({ id, size }) {
    if (id === "agent") return /*#__PURE__*/ _jsx(AgentIcon, {
        size: size
    });
    if (id === "prep") return /*#__PURE__*/ _jsx(BracesIcon, {
        size: size
    });
    if (id === "question") return /*#__PURE__*/ _jsx(StageIcon, {
        id: "question",
        size: size
    });
    return /*#__PURE__*/ _jsx(StageIcon, {
        id: id,
        size: size
    });
}
function Node({ id, label, x, y, shape, color, state, metric, selected, sub, count, onSelect }) {
    const badge = state === "done" ? "ok" : state === "warning" ? "warn" : state === "failed" ? "bad" : null;
    const [w, h] = shape === "agent" ? [
        240,
        92
    ] : shape === "circle" ? [
        80,
        80
    ] : [
        88,
        88
    ];
    return /*#__PURE__*/ _jsxs("g", {
        className: "wf-node",
        "data-state": state,
        "data-shape": shape,
        "data-selected": selected,
        transform: `translate(${x} ${y})`,
        onClick: onSelect,
        style: {
            ["--node"]: color
        },
        tabIndex: 0,
        role: "button",
        "aria-label": `${label}: ${stateWord(state)}`,
        onKeyDown: (e)=>{
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
            }
        },
        children: [
            (state === "active" || state === "thinking") && (shape === "circle" ? /*#__PURE__*/ _jsx("circle", {
                className: "wf-halo",
                r: w / 2 + 10
            }) : /*#__PURE__*/ _jsx("rect", {
                className: "wf-halo",
                x: -w / 2 - 10,
                y: -h / 2 - 10,
                width: w + 20,
                height: h + 20,
                rx: shape === "agent" ? 30 : 26
            })),
            shape === "circle" ? /*#__PURE__*/ _jsx("circle", {
                className: "wf-body",
                r: w / 2
            }) : /*#__PURE__*/ _jsx("rect", {
                className: "wf-body",
                x: -w / 2,
                y: -h / 2,
                width: w,
                height: h,
                rx: shape === "agent" ? 22 : 20
            }),
            state === "thinking" && /*#__PURE__*/ _jsx("rect", {
                className: "wf-orbit",
                x: -w / 2 - 5,
                y: -h / 2 - 5,
                width: w + 10,
                height: h + 10,
                rx: 26,
                pathLength: 100
            }),
            state === "active" && shape !== "agent" && (shape === "circle" ? /*#__PURE__*/ _jsx("circle", {
                className: "wf-spin",
                r: w / 2 + 5,
                pathLength: 100
            }) : /*#__PURE__*/ _jsx("rect", {
                className: "wf-spin",
                x: -w / 2 - 5,
                y: -h / 2 - 5,
                width: w + 10,
                height: h + 10,
                rx: 24,
                pathLength: 100
            })),
            shape === "agent" ? /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsx("g", {
                        className: "wf-icon",
                        transform: "translate(-96 -17)",
                        children: /*#__PURE__*/ _jsx(NodeIcon, {
                            id: id,
                            size: 34
                        })
                    }),
                    /*#__PURE__*/ _jsx("text", {
                        className: "wf-agent-title",
                        x: -50,
                        y: -4,
                        children: "AI Agent"
                    }),
                    /*#__PURE__*/ _jsx("text", {
                        className: "wf-agent-sub",
                        x: -50,
                        y: 16,
                        children: (sub ?? "").length > 26 ? (sub ?? "").slice(0, 25) + "…" : sub
                    })
                ]
            }) : /*#__PURE__*/ _jsx("g", {
                className: "wf-icon",
                transform: `translate(${shape === "circle" ? -15 : -17} ${shape === "circle" ? -15 : -17})`,
                children: /*#__PURE__*/ _jsx(NodeIcon, {
                    id: id,
                    size: shape === "circle" ? 30 : 34
                })
            }),
            badge && /*#__PURE__*/ _jsxs("g", {
                className: `wf-badge ${badge}`,
                transform: `translate(${shape === "circle" ? 28 : w / 2 - 4} ${shape === "circle" ? -28 : -h / 2 + 4})`,
                children: [
                    /*#__PURE__*/ _jsx("circle", {
                        r: 10
                    }),
                    badge === "ok" ? /*#__PURE__*/ _jsx("path", {
                        d: "m-4 0 3 3 5-6"
                    }) : badge === "bad" ? /*#__PURE__*/ _jsx("path", {
                        d: "m-3.5-3.5 7 7m0-7-7 7"
                    }) : /*#__PURE__*/ _jsx("path", {
                        d: "M0-4.5v5m0 3v.5"
                    })
                ]
            }),
            count != null && count > 0 && /*#__PURE__*/ _jsxs("g", {
                className: "wf-count",
                transform: `translate(${shape === "agent" ? w / 2 - 6 : shape === "circle" ? -30 : -w / 2 + 4} ${-h / 2 + (shape === "circle" ? 12 : 4)})`,
                children: [
                    /*#__PURE__*/ _jsx("rect", {
                        x: -13,
                        y: -10,
                        width: 26,
                        height: 20,
                        rx: 10
                    }),
                    /*#__PURE__*/ _jsx("text", {
                        y: 4,
                        children: count
                    })
                ]
            }),
            shape !== "agent" && /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsx("text", {
                        className: "wf-label",
                        y: h / 2 + 22,
                        children: label
                    }),
                    /*#__PURE__*/ _jsx("text", {
                        className: "wf-metric",
                        y: h / 2 + 38,
                        children: metric
                    })
                ]
            })
        ]
    });
}
function Inspector({ node, model, question, running }) {
    const papers = /*#__PURE__*/ _jsx("ul", {
        className: "wf-papers",
        children: model.papers.map((p)=>/*#__PURE__*/ _jsxs("li", {
                "data-extraction": p.extraction,
                children: [
                    /*#__PURE__*/ _jsxs("span", {
                        className: "wf-doc",
                        children: [
                            /*#__PURE__*/ _jsx(DocIcon, {
                                size: 16
                            }),
                            p.extraction === "reading" && /*#__PURE__*/ _jsx("span", {
                                className: "wf-scan"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("span", {
                        children: [
                            /*#__PURE__*/ _jsx("b", {
                                children: p.title
                            }),
                            /*#__PURE__*/ _jsxs("small", {
                                children: [
                                    p.access,
                                    p.retrieval ? ` · ${p.retrieval}` : "",
                                    " · ",
                                    {
                                        pending: "awaiting extraction",
                                        reading: "under extraction…",
                                        not_extracted: "not extracted in this run",
                                        values: `${p.values} cited value${p.values === 1 ? "" : "s"}`,
                                        no_values: "no usable values",
                                        rejected: "proposal rejected by checks",
                                        unavailable: "extraction unavailable"
                                    }[p.extraction]
                                ]
                            })
                        ]
                    })
                ]
            }, p.key))
    });
    switch(node){
        case "question":
            return /*#__PURE__*/ _jsxs("div", {
                className: "wf-pane",
                children: [
                    /*#__PURE__*/ _jsxs("p", {
                        className: "wf-quote",
                        children: [
                            "“",
                            question,
                            "”"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "wf-muted",
                        children: "The researcher's hypothesis, sent to the agent as written."
                    })
                ]
            });
        case "prep":
            return /*#__PURE__*/ _jsxs("div", {
                className: "wf-pane",
                children: [
                    /*#__PURE__*/ _jsx("p", {
                        children: "Resolves the drug and target identity, the route, and which model inputs the question needs."
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "wf-stat-line",
                        children: /*#__PURE__*/ _jsx("b", {
                            children: model.stages[0].metric ?? (running ? "working…" : "—")
                        })
                    })
                ]
            });
        case "agent":
            return /*#__PURE__*/ _jsxs("div", {
                className: "wf-pane",
                children: [
                    /*#__PURE__*/ _jsx("p", {
                        children: "An LLM agent that plans the investigation and calls deterministic scientific tools. It never writes numbers itself; tools and the solver do."
                    }),
                    /*#__PURE__*/ _jsxs("dl", {
                        className: "wf-facts",
                        children: [
                            /*#__PURE__*/ _jsx("dt", {
                                children: "Model"
                            }),
                            /*#__PURE__*/ _jsx("dd", {
                                children: "NVIDIA Nemotron (LangChain)"
                            }),
                            /*#__PURE__*/ _jsx("dt", {
                                children: "Tool calls"
                            }),
                            /*#__PURE__*/ _jsx("dd", {
                                children: model.toolCalls
                            }),
                            /*#__PURE__*/ _jsx("dt", {
                                children: "Elapsed"
                            }),
                            /*#__PURE__*/ _jsxs("dd", {
                                children: [
                                    Math.floor(model.elapsed),
                                    " s"
                                ]
                            }),
                            /*#__PURE__*/ _jsx("dt", {
                                children: "Now"
                            }),
                            /*#__PURE__*/ _jsx("dd", {
                                children: model.active?.label ?? (running ? "reasoning" : "finished")
                            })
                        ]
                    })
                ]
            });
        case "search":
            return /*#__PURE__*/ _jsxs("div", {
                className: "wf-pane",
                children: [
                    /*#__PURE__*/ _jsx("p", {
                        children: "Searches Europe PMC for papers about the drug, its pharmacokinetics and target binding."
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "wf-stat-line",
                        children: /*#__PURE__*/ _jsx("b", {
                            children: model.stages[1].metric ?? (running ? "searching…" : "not run")
                        })
                    }),
                    model.papers.length ? /*#__PURE__*/ _jsxs(_Fragment, {
                        children: [
                            /*#__PURE__*/ _jsx("p", {
                                className: "wf-sub",
                                children: "Selected for reading"
                            }),
                            papers
                        ]
                    }) : null
                ]
            });
        case "reading":
            return /*#__PURE__*/ _jsx("div", {
                className: "wf-pane",
                children: model.papers.length ? papers : /*#__PURE__*/ _jsx(Empty, {
                    text: model.edit ? "Experiment changes reuse the stored evidence." : "Papers appear as the agent retrieves them."
                })
            });
        case "extraction":
            return /*#__PURE__*/ _jsx("div", {
                className: "wf-pane",
                children: model.values.length ? /*#__PURE__*/ _jsxs(_Fragment, {
                    children: [
                        /*#__PURE__*/ _jsx("p", {
                            className: "wf-sub",
                            children: "Extracted from paper text and verified against the quoted passage"
                        }),
                        /*#__PURE__*/ _jsx("ul", {
                            className: "wf-values",
                            children: model.values.map((v)=>/*#__PURE__*/ _jsxs("li", {
                                    "data-matches": v.matches,
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            children: v.label
                                        }),
                                        /*#__PURE__*/ _jsx("b", {
                                            children: v.display
                                        }),
                                        v.matches && /*#__PURE__*/ _jsxs("em", {
                                            children: [
                                                /*#__PURE__*/ _jsx(CheckIcon, {
                                                    size: 10
                                                }),
                                                " matches model input"
                                            ]
                                        })
                                    ]
                                }, v.parameter + v.display))
                        })
                    ]
                }) : /*#__PURE__*/ _jsx(Empty, {
                    text: model.stages[3].calls ? "No values accepted yet; rejected proposals are retried or reported." : "Values appear as the agent extracts them."
                })
            });
        case "model":
            return /*#__PURE__*/ _jsx("div", {
                className: "wf-pane",
                children: model.shownInputs.length ? /*#__PURE__*/ _jsxs(_Fragment, {
                    children: [
                        /*#__PURE__*/ _jsx("p", {
                            className: "wf-sub",
                            children: model.audited ? "Audited reference inputs (extractions are compared, not substituted)" : "Inputs the solver uses"
                        }),
                        /*#__PURE__*/ _jsx("ul", {
                            className: "wf-inputs",
                            children: model.shownInputs.map((i)=>/*#__PURE__*/ _jsxs("li", {
                                    "data-confirmed": i.confirmed,
                                    children: [
                                        /*#__PURE__*/ _jsxs("span", {
                                            children: [
                                                i.label,
                                                i.changed && /*#__PURE__*/ _jsx("em", {
                                                    children: i.scenario ?? "alternative"
                                                }),
                                                i.confirmed && /*#__PURE__*/ _jsxs("em", {
                                                    className: "ok",
                                                    children: [
                                                        /*#__PURE__*/ _jsx(CheckIcon, {
                                                            size: 9
                                                        }),
                                                        " extracted"
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsx("b", {
                                            children: i.display
                                        }),
                                        /*#__PURE__*/ _jsxs("small", {
                                            children: [
                                                i.reviewed ? "reviewed" : i.provenance,
                                                i.sources.length ? ` · ${i.sources.join(", ")}` : ""
                                            ]
                                        })
                                    ]
                                }, i.key))
                        }),
                        model.hiddenInputs > 0 && /*#__PURE__*/ _jsxs("p", {
                            className: "wf-muted",
                            children: [
                                "+",
                                model.hiddenInputs,
                                " more inputs in the investigation panel"
                            ]
                        })
                    ]
                }) : /*#__PURE__*/ _jsx(Empty, {
                    text: "The configured experiment appears here."
                })
            });
        case "simulation":
            return /*#__PURE__*/ _jsx("div", {
                className: "wf-pane",
                children: model.metrics.length ? /*#__PURE__*/ _jsxs("ul", {
                    className: "wf-bars",
                    children: [
                        model.metrics.map((m)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        children: m.label
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        className: "wf-track",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "wf-fill",
                                                style: {
                                                    width: `${Math.max(2, m.occupancy * 100)}%`,
                                                    background: scenarioColor(m.scenarioId, m.index)
                                                }
                                            }),
                                            model.threshold != null && /*#__PURE__*/ _jsx("span", {
                                                className: "wf-threshold",
                                                style: {
                                                    left: `${model.threshold * 100}%`
                                                }
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("b", {
                                        children: [
                                            (m.occupancy * 100).toFixed(1),
                                            "%"
                                        ]
                                    })
                                ]
                            }, m.scenarioId)),
                        /*#__PURE__*/ _jsxs("li", {
                            className: "wf-muted",
                            children: [
                                "Endpoint target occupancy · line = ",
                                model.threshold != null ? Math.round(model.threshold * 100) : "–",
                                "% threshold"
                            ]
                        })
                    ]
                }) : /*#__PURE__*/ _jsx(Empty, {
                    text: "Solver results appear when the simulation runs."
                })
            });
        case "structure":
            return /*#__PURE__*/ _jsx("div", {
                className: "wf-pane",
                children: model.structure ? model.structure.available ? /*#__PURE__*/ _jsxs("dl", {
                    className: "wf-facts",
                    children: [
                        /*#__PURE__*/ _jsx("dt", {
                            children: "PDB entry"
                        }),
                        /*#__PURE__*/ _jsx("dd", {
                            children: model.structure.pdb_id
                        }),
                        /*#__PURE__*/ _jsx("dt", {
                            children: "Interface contacts"
                        }),
                        /*#__PURE__*/ _jsxs("dd", {
                            children: [
                                model.structure.interface_residue_pair_count ?? "–",
                                " residue pairs ≤ 4 Å"
                            ]
                        }),
                        /*#__PURE__*/ _jsx("dt", {
                            children: "Measurements"
                        }),
                        /*#__PURE__*/ _jsxs("dd", {
                            children: [
                                model.structure.measurement_ids?.length ?? 0,
                                " from deposited coordinates"
                            ]
                        })
                    ]
                }) : /*#__PURE__*/ _jsx("p", {
                    children: "No verified experimental structure for this drug and target; the simulation is unaffected."
                }) : /*#__PURE__*/ _jsx(Empty, {
                    text: "The agent inspects the experimental drug–target structure."
                })
            });
        case "answer":
            return /*#__PURE__*/ _jsx("div", {
                className: "wf-pane",
                children: model.synthesis ? /*#__PURE__*/ _jsx("p", {
                    children: model.synthesis.status === "grounded" ? "Grounded answer written: every claim links to a paper quote, a solver value or a structure measurement." : `Written answer ${model.synthesis.status}; the recorded results still stand.`
                }) : /*#__PURE__*/ _jsx(Empty, {
                    text: "Written last, from the recorded results."
                })
            });
    }
}
/** The evidence gathered so far, so the panel is never empty while the agent works; skips the selected node's own view. */ function RunSoFar({ node, model }) {
    const papers = node !== "reading" && node !== "search" && model.papers.length > 0;
    const values = node !== "extraction" && model.values.length > 0;
    const results = node !== "simulation" && model.metrics.length > 0;
    const structure = node !== "structure" && model.structure?.available;
    if (!papers && !values && !results && !structure) return null;
    return /*#__PURE__*/ _jsxs("section", {
        className: "wf-sofar",
        "aria-label": "Run so far",
        children: [
            /*#__PURE__*/ _jsx("h4", {
                children: "Run so far"
            }),
            papers && /*#__PURE__*/ _jsxs("div", {
                children: [
                    /*#__PURE__*/ _jsxs("span", {
                        className: "wf-sofar-label",
                        children: [
                            /*#__PURE__*/ _jsx(StageIcon, {
                                id: "reading",
                                size: 13
                            }),
                            " ",
                            model.papers.length,
                            " paper",
                            model.papers.length === 1 ? "" : "s",
                            " read"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        className: "wf-sofar-papers",
                        children: model.papers.map((p)=>/*#__PURE__*/ _jsx("li", {
                                "data-extraction": p.extraction,
                                children: p.title
                            }, p.key))
                    })
                ]
            }),
            values && /*#__PURE__*/ _jsxs("div", {
                children: [
                    /*#__PURE__*/ _jsxs("span", {
                        className: "wf-sofar-label",
                        children: [
                            /*#__PURE__*/ _jsx(StageIcon, {
                                id: "extraction",
                                size: 13
                            }),
                            " ",
                            model.values.length,
                            " cited value",
                            model.values.length === 1 ? "" : "s"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        className: "wf-values compact",
                        children: model.values.map((v)=>/*#__PURE__*/ _jsxs("li", {
                                "data-matches": v.matches,
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        children: v.label
                                    }),
                                    /*#__PURE__*/ _jsx("b", {
                                        children: v.display
                                    }),
                                    v.matches && /*#__PURE__*/ _jsxs("em", {
                                        children: [
                                            /*#__PURE__*/ _jsx(CheckIcon, {
                                                size: 9
                                            }),
                                            " matches input"
                                        ]
                                    })
                                ]
                            }, v.parameter + v.display))
                    })
                ]
            }),
            results && /*#__PURE__*/ _jsxs("div", {
                children: [
                    /*#__PURE__*/ _jsxs("span", {
                        className: "wf-sofar-label",
                        children: [
                            /*#__PURE__*/ _jsx(StageIcon, {
                                id: "simulation",
                                size: 13
                            }),
                            " Endpoint occupancy"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        className: "wf-sofar-results",
                        children: model.metrics.map((m)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    /*#__PURE__*/ _jsx("i", {
                                        style: {
                                            background: scenarioColor(m.scenarioId, m.index)
                                        }
                                    }),
                                    m.label,
                                    /*#__PURE__*/ _jsxs("b", {
                                        children: [
                                            (m.occupancy * 100).toFixed(1),
                                            "%"
                                        ]
                                    })
                                ]
                            }, m.scenarioId))
                    })
                ]
            }),
            structure && /*#__PURE__*/ _jsx("div", {
                children: /*#__PURE__*/ _jsxs("span", {
                    className: "wf-sofar-label",
                    children: [
                        /*#__PURE__*/ _jsx(StageIcon, {
                            id: "structure",
                            size: 13
                        }),
                        " PDB ",
                        model.structure.pdb_id,
                        " · ",
                        model.structure.interface_residue_pair_count ?? "–",
                        " contacts"
                    ]
                })
            })
        ]
    });
}
function Empty({ text }) {
    return /*#__PURE__*/ _jsxs("div", {
        className: "wf-empty",
        children: [
            /*#__PURE__*/ _jsx("span", {}),
            /*#__PURE__*/ _jsx("span", {}),
            /*#__PURE__*/ _jsx("span", {}),
            /*#__PURE__*/ _jsx("p", {
                children: text
            })
        ]
    });
}
export { CrossIcon };
