"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { accessSummary, answerState, basisLabel, canFocus, findingLinks, keyQuantities, measurementCards, structuralObservations, verdictLabel } from "../lib/synthesis-view.js";
import { locatorLabel, readableText } from "../lib/readable.js";
const STANCE = {
    supports: "Supports the hypothesis",
    contradicts: "Contradicts the hypothesis",
    context: "Context"
};
const KIND = {
    measurement: "Measurement",
    simulation_change: "Simulation change",
    literature_review: "Literature review"
};
const plotName = (id)=>id === "concentration" ? "concentration plot" : "occupancy plot";
function Chips({ chips }) {
    return /*#__PURE__*/ _jsx("ul", {
        className: "answer-chips",
        children: chips.map((chip)=>/*#__PURE__*/ _jsx("li", {
                children: /*#__PURE__*/ _jsxs("a", {
                    href: `#plot-${chip.plot}`,
                    title: `Show the ${plotName(chip.plot)}`,
                    children: [
                        /*#__PURE__*/ _jsxs("span", {
                            children: [
                                chip.scenario,
                                " · ",
                                chip.metric
                            ]
                        }),
                        /*#__PURE__*/ _jsx("strong", {
                            children: chip.display
                        }),
                        chip.censored && /*#__PURE__*/ _jsx("em", {
                            children: "cut off by the observation window"
                        })
                    ]
                })
            }, chip.key))
    });
}
/** Agent-measured coordinate pairs; a card opens the same residues and distance in the molecular viewer. */ export function MeasurementCards({ cards, viewer, onFocus }) {
    return /*#__PURE__*/ _jsx("ul", {
        className: "measurement-cards",
        children: cards.map((card)=>/*#__PURE__*/ _jsxs("li", {
                children: [
                    /*#__PURE__*/ _jsxs("span", {
                        className: "measurement-id",
                        children: [
                            card.id,
                            " · ",
                            card.origin
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("strong", {
                        children: [
                            card.drug,
                            " ↔ ",
                            card.target
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("span", {
                        className: "measurement-distance",
                        children: [
                            card.distance,
                            /*#__PURE__*/ _jsxs("small", {
                                children: [
                                    card.atoms,
                                    " · ",
                                    card.withinCutoff ? "within 4 Å" : "beyond 4 Å",
                                    " · PDB ",
                                    card.pdbId
                                ]
                            })
                        ]
                    }),
                    onFocus && canFocus(card, viewer) ? /*#__PURE__*/ _jsx("button", {
                        type: "button",
                        onClick: ()=>onFocus(card),
                        children: "Show in structure →"
                    }) : /*#__PURE__*/ _jsx("small", {
                        children: "Not available in the current structure view."
                    })
                ]
            }, card.id))
    });
}
/** One answer above its supporting detail. Prose is server-validated; every number shown is a solver field. */ export function ScientificAnswer({ turn, shown, viewer = "unavailable", onFocusMeasurement, questionShown = false }) {
    const state = answerState(turn, shown);
    if (state === "none" || !turn?.synthesis) return null;
    if (state === "invalid") return /*#__PURE__*/ _jsx("section", {
        id: "answer",
        className: "answer-panel",
        "aria-label": "Scientific answer",
        children: /*#__PURE__*/ _jsx("p", {
            role: "alert",
            children: "The written answer for this run could not be matched to its numerical result, so it is not shown. The curves and evidence below are unaffected."
        })
    });
    const synthesis = turn.synthesis, stale = state === "stale";
    const chips = keyQuantities(turn), byKey = new Map(chips.map((chip)=>[
            chip.key,
            chip
        ]));
    const implications = synthesis.simulation_implications ?? [], findings = synthesis.evidence_findings ?? [];
    const disagreements = synthesis.disagreements ?? [], missing = synthesis.missing_evidence ?? [];
    const limitations = synthesis.limitations ?? [], next = synthesis.next_experiments ?? [], access = accessSummary(synthesis);
    const cards = measurementCards(turn), observations = structuralObservations(turn), cited = new Set(observations.flatMap((item)=>item.cards.map((card)=>card.id)));
    const uncited = cards.filter((card)=>!cited.has(card.id)), notMeasured = turn.structure?.not_measured ?? [];
    return /*#__PURE__*/ _jsxs("section", {
        id: "answer",
        className: `answer-panel${stale ? " is-stale" : ""}`,
        "aria-label": "Scientific answer",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "answer-summary",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "answer-heading",
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                children: questionShown ? /*#__PURE__*/ _jsx("h2", {
                                    className: "answer-title",
                                    children: "Answer"
                                }) : /*#__PURE__*/ _jsxs(_Fragment, {
                                    children: [
                                        /*#__PURE__*/ _jsx("p", {
                                            className: "eyebrow",
                                            children: "Scientific answer"
                                        }),
                                        /*#__PURE__*/ _jsx("h2", {
                                            children: synthesis.original_text
                                        })
                                    ]
                                })
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "answer-badges",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "answer-verdict",
                                        "data-verdict": synthesis.answer?.verdict ?? synthesis.status,
                                        children: verdictLabel(synthesis, !!turn?.parent_result_id)
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "answer-basis",
                                        children: basisLabel(synthesis)
                                    })
                                ]
                            })
                        ]
                    }),
                    turn.applied_proposal && /*#__PURE__*/ _jsxs("p", {
                        className: "answer-origin",
                        children: [
                            "Follow-up experiment run from a proposal: ",
                            /*#__PURE__*/ _jsx("strong", {
                                children: turn.applied_proposal.title
                            }),
                            ". ",
                            turn.applied_proposal.changes.map((change)=>`${change.parameter}${change.scenario_label ? ` (${change.scenario_label})` : ""}: ${change.from_display} → ${change.to_display}`).join("; "),
                            ". Run from result ",
                            turn.applied_proposal.base_result_id,
                            "."
                        ]
                    }),
                    !turn.applied_proposal && turn.original_text !== synthesis.original_text && /*#__PURE__*/ _jsxs("p", {
                        className: "answer-origin",
                        children: [
                            "Change applied to reach this result: ",
                            /*#__PURE__*/ _jsx("strong", {
                                children: turn.original_text
                            }),
                            ". The answer addresses the investigation's original question with this result."
                        ]
                    }),
                    stale && /*#__PURE__*/ _jsxs("p", {
                        className: "answer-stale",
                        role: "status",
                        children: [
                            /*#__PURE__*/ _jsx("strong", {
                                children: "This answer describes an earlier result."
                            }),
                            " The curves below now reflect ",
                            shown ? "your direct parameter changes" : "a different experiment",
                            ", so its solver values and simulation statements no longer apply.",
                            findings.length ? " Paper findings are unchanged." : "",
                            " Use ",
                            /*#__PURE__*/ _jsx("a", {
                                href: "#revise",
                                children: "Change the experiment in words"
                            }),
                            " or new research to get an answer for the current curves."
                        ]
                    }),
                    state === "evidence_only" && shown && /*#__PURE__*/ _jsx("p", {
                        className: "scope-note",
                        children: "No simulation was run for this question. The curves below belong to an earlier experiment and are not part of this answer."
                    }),
                    synthesis.answer ? /*#__PURE__*/ _jsx("p", {
                        className: "answer-statement",
                        children: synthesis.answer.statement
                    }) : /*#__PURE__*/ _jsxs("p", {
                        className: "answer-unavailable",
                        children: [
                            synthesis.notes?.[0] ?? "No written answer was accepted for this run.",
                            " ",
                            turn.result ? "The numerical result, plots and evidence below are unaffected." : "Evidence gathered in this run is listed below."
                        ]
                    }),
                    synthesis.answer && (synthesis.notes ?? []).map((note, index)=>/*#__PURE__*/ _jsx("p", {
                            className: "answer-access-note",
                            children: note
                        }, index))
                ]
            }),
            chips.length > 0 && /*#__PURE__*/ _jsxs("section", {
                className: "answer-solver",
                "aria-label": "Key solver findings",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "answer-section-heading",
                        children: [
                            /*#__PURE__*/ _jsx("h3", {
                                children: "Key solver findings"
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                children: stale ? "From the earlier result · not the displayed curves" : "Conditional model predictions · values copied from the solver"
                            })
                        ]
                    }),
                    implications.length ? /*#__PURE__*/ _jsx("ul", {
                        className: "answer-implications",
                        children: implications.map((item, index)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    /*#__PURE__*/ _jsx("p", {
                                        children: item.statement
                                    }),
                                    /*#__PURE__*/ _jsx(Chips, {
                                        chips: [
                                            ...new Map(item.quantities.map((q)=>[
                                                    `${q.scenario_id}:${q.metric}`,
                                                    byKey.get(`${q.scenario_id}:${q.metric}`)
                                                ])).values()
                                        ].filter(Boolean)
                                    })
                                ]
                            }, index))
                    }) : /*#__PURE__*/ _jsx(Chips, {
                        chips: chips
                    })
                ]
            }),
            findings.length > 0 && /*#__PURE__*/ _jsxs("details", {
                className: "answer-detail",
                open: true,
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "What the inspected papers report ",
                            /*#__PURE__*/ _jsxs("span", {
                                children: [
                                    findings.length,
                                    " finding",
                                    findings.length === 1 ? "" : "s",
                                    access ? ` · ${access}` : ""
                                ]
                            })
                        ]
                    }),
                    findings.map((finding)=>/*#__PURE__*/ _jsxs("article", {
                            className: "answer-finding",
                            "data-stance": finding.stance,
                            children: [
                                /*#__PURE__*/ _jsxs("p", {
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "answer-stance",
                                            children: STANCE[finding.stance]
                                        }),
                                        finding.abstract_only && /*#__PURE__*/ _jsx("span", {
                                            className: "answer-access",
                                            children: "Abstract only"
                                        }),
                                        " ",
                                        finding.statement
                                    ]
                                }),
                                finding.citations.map((citation, index)=>/*#__PURE__*/ _jsxs("blockquote", {
                                        children: [
                                            "“",
                                            citation.quote,
                                            "”",
                                            /*#__PURE__*/ _jsx("small", {
                                                children: citation.content_kind === "abstract" ? "Abstract" : locatorLabel(citation.locator)
                                            })
                                        ]
                                    }, index)),
                                findingLinks(turn, finding).map((link)=>/*#__PURE__*/ _jsxs("div", {
                                        className: "answer-links",
                                        children: [
                                            /*#__PURE__*/ _jsxs("p", {
                                                children: [
                                                    link.url ? /*#__PURE__*/ _jsxs("a", {
                                                        href: link.url,
                                                        target: "_blank",
                                                        rel: "noreferrer",
                                                        children: [
                                                            link.title,
                                                            " ↗"
                                                        ]
                                                    }) : link.title,
                                                    " · ",
                                                    /*#__PURE__*/ _jsx("a", {
                                                        href: `#${link.anchor}`,
                                                        children: "extraction record ↓"
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("p", {
                                                children: [
                                                    link.simulationUse,
                                                    !link.records.length && turn.result ? /*#__PURE__*/ _jsxs(_Fragment, {
                                                        children: [
                                                            " ",
                                                            /*#__PURE__*/ _jsx("a", {
                                                                href: "#paper-evidence",
                                                                children: "Simulation input sources →"
                                                            })
                                                        ]
                                                    }) : null
                                                ]
                                            }),
                                            link.records.length > 0 && /*#__PURE__*/ _jsxs("details", {
                                                className: "answer-inputs",
                                                open: link.records.length <= 3,
                                                children: [
                                                    /*#__PURE__*/ _jsxs("summary", {
                                                        children: [
                                                            link.records.length,
                                                            " simulation input",
                                                            link.records.length === 1 ? "" : "s",
                                                            " from this source"
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsx("ul", {
                                                        children: link.records.map((record)=>/*#__PURE__*/ _jsxs("li", {
                                                                title: `Parameter record ${record.evidenceId}`,
                                                                children: [
                                                                    readableText(record.text),
                                                                    " · ",
                                                                    record.plots.map((id)=>/*#__PURE__*/ _jsxs("a", {
                                                                            href: `#plot-${id}`,
                                                                            children: [
                                                                                plotName(id),
                                                                                " →"
                                                                            ]
                                                                        }, id))
                                                                ]
                                                            }, record.evidenceId))
                                                    })
                                                ]
                                            }),
                                            link.candidates.length > 0 && /*#__PURE__*/ _jsx("ul", {
                                                children: link.candidates.map((candidate, index)=>/*#__PURE__*/ _jsxs("li", {
                                                        children: [
                                                            "Extracted candidate: ",
                                                            readableText(candidate.text),
                                                            " · ",
                                                            turn.result ? /*#__PURE__*/ _jsxs(_Fragment, {
                                                                children: [
                                                                    "informs the ",
                                                                    candidate.plots.map((id)=>/*#__PURE__*/ _jsxs("a", {
                                                                            href: `#plot-${id}`,
                                                                            children: [
                                                                                plotName(id),
                                                                                " →"
                                                                            ]
                                                                        }, id))
                                                                ]
                                                            }) : `would inform the ${candidate.plots.map(plotName).join(" and ")} once a simulation can run`
                                                        ]
                                                    }, index))
                                            })
                                        ]
                                    }, link.documentId))
                            ]
                        }, finding.finding_id))
                ]
            }),
            !findings.length && access && /*#__PURE__*/ _jsxs("p", {
                className: "answer-access-note",
                children: [
                    access,
                    ". ",
                    synthesis.status === "grounded" ? "No paper finding was cited for this answer." : "No paper finding was accepted."
                ]
            }),
            (turn.structure || synthesis.structure_note) && /*#__PURE__*/ _jsxs("section", {
                className: "answer-structure",
                "aria-label": "Structural context",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "answer-section-heading",
                        children: [
                            /*#__PURE__*/ _jsx("h3", {
                                children: "Structural context"
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                children: cards.length ? `Agent-measured coordinates · PDB ${cards[0].pdbId} · geometry only` : "No verified structure for this drug and target"
                            })
                        ]
                    }),
                    synthesis.structure_note && /*#__PURE__*/ _jsx("p", {
                        className: "answer-structure-note",
                        children: synthesis.structure_note
                    }),
                    observations.map((item, index)=>/*#__PURE__*/ _jsxs("div", {
                            className: "answer-observation",
                            children: [
                                /*#__PURE__*/ _jsx("p", {
                                    children: item.statement
                                }),
                                /*#__PURE__*/ _jsx(MeasurementCards, {
                                    cards: item.cards,
                                    viewer: viewer,
                                    onFocus: onFocusMeasurement
                                })
                            ]
                        }, index)),
                    uncited.length > 0 && (observations.length ? /*#__PURE__*/ _jsxs("details", {
                        className: "answer-detail",
                        children: [
                            /*#__PURE__*/ _jsxs("summary", {
                                children: [
                                    "Other agent measurements ",
                                    /*#__PURE__*/ _jsx("span", {
                                        children: uncited.length
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx(MeasurementCards, {
                                cards: uncited,
                                viewer: viewer,
                                onFocus: onFocusMeasurement
                            })
                        ]
                    }) : /*#__PURE__*/ _jsx(MeasurementCards, {
                        cards: uncited,
                        viewer: viewer,
                        onFocus: onFocusMeasurement
                    })),
                    notMeasured.length > 0 && /*#__PURE__*/ _jsx("ul", {
                        className: "answer-not-measured",
                        children: notMeasured.map((note, index)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    "Not measured: ",
                                    note
                                ]
                            }, index))
                    }),
                    cards.length > 0 && /*#__PURE__*/ _jsx("p", {
                        className: "answer-access-note",
                        children: "Distances are between heavy atoms in deposited coordinates. They do not establish hydrogen bonds, binding energy, affinity or kinetic rates."
                    })
                ]
            }),
            disagreements.length > 0 && /*#__PURE__*/ _jsxs("section", {
                className: "answer-disagreements",
                "aria-label": "Disagreements in the evidence",
                children: [
                    /*#__PURE__*/ _jsx("h3", {
                        children: "Where the evidence disagrees"
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: disagreements.map((item, index)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    readableText(item.statement),
                                    item.finding_ids?.length ? /*#__PURE__*/ _jsxs("small", {
                                        children: [
                                            " Findings ",
                                            item.finding_ids.join(", ")
                                        ]
                                    }) : /*#__PURE__*/ _jsx("small", {
                                        children: " Competing extracted candidates"
                                    })
                                ]
                            }, index))
                    })
                ]
            }),
            next.length > 0 && /*#__PURE__*/ _jsxs("section", {
                className: "answer-next",
                "aria-label": "Hypotheses needing validation",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "answer-section-heading",
                        children: [
                            /*#__PURE__*/ _jsx("h3", {
                                children: "What to test next"
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                children: "Hypotheses needing experimental validation"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: next.map((item, index)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "answer-kind",
                                        children: KIND[item.kind]
                                    }),
                                    /*#__PURE__*/ _jsx("p", {
                                        children: readableText(item.proposal)
                                    }),
                                    /*#__PURE__*/ _jsx("small", {
                                        children: readableText(item.rationale)
                                    })
                                ]
                            }, index))
                    })
                ]
            }),
            missing.length > 0 && /*#__PURE__*/ _jsxs("details", {
                className: "answer-detail",
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "Missing evidence ",
                            /*#__PURE__*/ _jsx("span", {
                                children: missing.length
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: missing.map((item, index)=>/*#__PURE__*/ _jsx("li", {
                                children: readableText(item.statement)
                            }, index))
                    })
                ]
            }),
            limitations.length > 0 && /*#__PURE__*/ _jsxs("details", {
                className: "answer-detail",
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "Limitations of this answer ",
                            /*#__PURE__*/ _jsx("span", {
                                children: limitations.length
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: limitations.map((item, index)=>/*#__PURE__*/ _jsx("li", {
                                children: readableText(item)
                            }, index))
                    })
                ]
            }),
            (synthesis.source_access ?? []).some((item)=>item.limitation) && /*#__PURE__*/ _jsxs("details", {
                className: "answer-detail",
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "Source access ",
                            /*#__PURE__*/ _jsx("span", {
                                children: access
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("ul", {
                        children: (synthesis.source_access ?? []).map((item)=>/*#__PURE__*/ _jsxs("li", {
                                children: [
                                    /*#__PURE__*/ _jsx("a", {
                                        href: `#paper-${item.document_id}`,
                                        children: item.title
                                    }),
                                    " · extraction ",
                                    item.extraction_status.replaceAll("_", " "),
                                    item.limitation ? ` · ${item.limitation}` : ""
                                ]
                            }, item.document_id))
                    })
                ]
            })
        ]
    });
}
