"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
const EMPTY = {
    drug_name: "Herceptin",
    target: "",
    molecular_form: "",
    route: "",
    endpoint: ""
};
const EXAMPLES = [
    {
        label: "Herceptin",
        request: {
            drug_name: "Herceptin"
        }
    },
    {
        label: "Imatinib",
        request: {
            drug_name: "imatinib",
            target: "Abl"
        }
    },
    {
        label: "Gleevec",
        request: {
            drug_name: "Gleevec"
        }
    },
    {
        label: "Unsupported route",
        request: {
            drug_name: "trastuzumab",
            route: "oral"
        }
    },
    {
        label: "Unknown name",
        request: {
            drug_name: "hypothesim-unknown-compound-7a"
        }
    }
];
function heading(result) {
    if (result.model_eligible) return "Reviewed model available · conditional";
    if (result.support.status === "unsupported") return "Outside the reviewed model scope";
    if (result.identity_status === "ambiguous") return "Clarification needed";
    if (result.identity_status === "candidate_identity") return "Drug identified · model not reviewed";
    if (result.identity_status === "not_found") return "No exact identity match";
    if (result.identity_status === "unavailable") return "Identity source unavailable";
    return "More details needed";
}
/** Diagnostic view of 7A; never substitutes an identity assessment for an experiment. */ export function DrugSupportPanel() {
    const [draft, setDraft] = useState(EMPTY);
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const active = useRef(null);
    const generation = useRef(0);
    useEffect(()=>()=>active.current?.abort(), []);
    function edit(field, value) {
        generation.current++;
        active.current?.abort();
        setBusy(false);
        setResult(null);
        setError(null);
        setDraft((current)=>({
                ...current,
                [field]: value
            }));
    }
    async function assess(request) {
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        const token = ++generation.current;
        setBusy(true);
        setResult(null);
        setError(null);
        try {
            const response = await fetch("/api/research/assess", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(request),
                cache: "no-store",
                signal: controller.signal
            });
            const data = await response.json().catch(()=>null);
            if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Support check failed. Check the inputs and retry.");
            if (token === generation.current && !controller.signal.aborted) setResult(data);
        } catch (problem) {
            if (token === generation.current && !controller.signal.aborted) setError(problem instanceof Error ? problem.message : "Support check unavailable. The existing experiment remains usable.");
        } finally{
            if (token === generation.current) setBusy(false);
        }
    }
    function submit(event) {
        event.preventDefault();
        void assess({
            drug_name: draft.drug_name,
            target: draft.target.trim() || null,
            molecular_form: draft.molecular_form.trim() || null,
            route: draft.route || null,
            endpoint: draft.endpoint || null
        });
    }
    function example(request) {
        setDraft({
            ...EMPTY,
            drug_name: request.drug_name,
            target: request.target ?? "",
            route: request.route ?? "",
            molecular_form: request.molecular_form ?? "",
            endpoint: request.endpoint ?? ""
        });
        void assess(request);
    }
    return /*#__PURE__*/ _jsxs("section", {
        id: "drug-support",
        className: "drug-support-panel",
        "aria-label": "Drug support assessment",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "section-heading",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("p", {
                                className: "eyebrow",
                                children: "Model scope"
                            }),
                            /*#__PURE__*/ _jsx("h2", {
                                children: "Drug identity and model scope"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "scope-badge",
                        children: "Identity + eligibility"
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("p", {
                children: "Check a drug name, molecular form, target, and route before preparing an experiment. This panel assesses support; it does not run or replace the simulation below."
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "support-examples",
                children: [
                    /*#__PURE__*/ _jsx("span", {
                        children: "Try a test case:"
                    }),
                    EXAMPLES.map((item)=>/*#__PURE__*/ _jsx("button", {
                            type: "button",
                            onClick: ()=>example(item.request),
                            children: item.label
                        }, item.label))
                ]
            }),
            /*#__PURE__*/ _jsxs("form", {
                onSubmit: submit,
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "form-grid support-fields",
                        children: [
                            /*#__PURE__*/ _jsxs("label", {
                                children: [
                                    "Drug to assess",
                                    /*#__PURE__*/ _jsx("input", {
                                        required: true,
                                        maxLength: 200,
                                        value: draft.drug_name,
                                        onChange: (event)=>edit("drug_name", event.target.value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("label", {
                                children: [
                                    "Target to assess ",
                                    /*#__PURE__*/ _jsx("input", {
                                        maxLength: 200,
                                        placeholder: "Reviewed default, if available",
                                        value: draft.target,
                                        onChange: (event)=>edit("target", event.target.value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("label", {
                                children: [
                                    "Molecular form ",
                                    /*#__PURE__*/ _jsx("input", {
                                        maxLength: 200,
                                        placeholder: "Optional · e.g. imatinib mesylate or Fab",
                                        value: draft.molecular_form,
                                        onChange: (event)=>edit("molecular_form", event.target.value)
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("label", {
                                children: [
                                    "Route to assess",
                                    /*#__PURE__*/ _jsxs("select", {
                                        value: draft.route,
                                        onChange: (event)=>edit("route", event.target.value),
                                        children: [
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "",
                                                children: "Reviewed default, if available"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "iv_infusion",
                                                children: "IV infusion"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "IV",
                                                children: "IV · method unspecified"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "hypothetical_iv_bolus",
                                                children: "Hypothetical IV bolus"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "oral",
                                                children: "Oral"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "subcutaneous",
                                                children: "Subcutaneous"
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("label", {
                                children: [
                                    "Endpoint to assess",
                                    /*#__PURE__*/ _jsxs("select", {
                                        value: draft.endpoint,
                                        onChange: (event)=>edit("endpoint", event.target.value),
                                        children: [
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "",
                                                children: "Reviewed default, if available"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "target_occupancy",
                                                children: "Target occupancy"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "clinical efficacy",
                                                children: "Clinical efficacy"
                                            }),
                                            /*#__PURE__*/ _jsx("option", {
                                                value: "toxicity",
                                                children: "Toxicity"
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("button", {
                        type: "submit",
                        className: "primary-button",
                        disabled: busy,
                        children: busy ? "Checking identities and model scope…" : "Check drug support →"
                    })
                ]
            }),
            error && /*#__PURE__*/ _jsx("p", {
                role: "alert",
                children: error
            }),
            /*#__PURE__*/ _jsxs("div", {
                "aria-live": "polite",
                "aria-busy": busy,
                children: [
                    busy && /*#__PURE__*/ _jsx("p", {
                        role: "status",
                        children: "Checking the reviewed catalog and, when needed, ChEMBL. No AI or simulation is being run."
                    }),
                    result && /*#__PURE__*/ _jsxs("div", {
                        className: `support-outcome ${result.model_eligible ? "eligible" : "limited"}`,
                        children: [
                            /*#__PURE__*/ _jsx("h3", {
                                children: heading(result)
                            }),
                            /*#__PURE__*/ _jsxs("p", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "Assessed:"
                                    }),
                                    " ",
                                    result.request.drug_name,
                                    result.request.target ? ` · ${result.request.target}` : "",
                                    result.request.route ? ` · ${result.request.route}` : ""
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("p", {
                                children: [
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: "Identity source:"
                                    }),
                                    " ",
                                    result.retrieval_status === "reviewed_registry" ? "Reviewed local catalog" : result.retrieval_status === "live" ? "Live ChEMBL lookup" : result.retrieval_status === "cached_degraded" ? "Cached ChEMBL identity · provider unavailable" : "Unavailable"
                                ]
                            }),
                            /*#__PURE__*/ _jsx("ul", {
                                children: result.support.reasons.map((reason)=>/*#__PURE__*/ _jsx("li", {
                                        children: reason
                                    }, reason))
                            }),
                            (result.ambiguities?.length ?? 0) > 0 && /*#__PURE__*/ _jsx("ul", {
                                children: result.ambiguities?.map((item)=>/*#__PURE__*/ _jsx("li", {
                                        children: item
                                    }, item))
                            }),
                            (result.support.missing_parameters?.length ?? 0) > 0 && /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: "What is needed next"
                                    }),
                                    /*#__PURE__*/ _jsx("ul", {
                                        children: result.support.missing_parameters?.map((item)=>/*#__PURE__*/ _jsx("li", {
                                                children: item
                                            }, item))
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "identity-cards",
                                children: result.candidates?.map((candidate)=>/*#__PURE__*/ _jsxs("article", {
                                        className: "identity-card",
                                        children: [
                                            /*#__PURE__*/ _jsx("h3", {
                                                children: candidate.canonical_name
                                            }),
                                            /*#__PURE__*/ _jsxs("p", {
                                                children: [
                                                    candidate.molecular_form,
                                                    " · ",
                                                    candidate.molecule_type
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("a", {
                                                href: candidate.source_url,
                                                target: "_blank",
                                                rel: "noreferrer",
                                                children: [
                                                    candidate.identifiers.chembl_id,
                                                    " · source record ↗"
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsx("p", {
                                                children: candidate.provenance === "reviewed_registry" ? "Registered identity linked to a reviewed profile" : "Database identity candidate; no scientific model approval"
                                            }),
                                            candidate.retrieved_at && /*#__PURE__*/ _jsxs("p", {
                                                children: [
                                                    "Retrieved ",
                                                    candidate.retrieved_at
                                                ]
                                            }),
                                            result.identity_status === "ambiguous" && /*#__PURE__*/ _jsxs("button", {
                                                type: "button",
                                                onClick: ()=>example({
                                                        ...result.request,
                                                        drug_name: candidate.identifiers.chembl_id ?? candidate.canonical_name,
                                                        molecular_form: candidate.molecular_form
                                                    }),
                                                children: [
                                                    "Assess exact identity ",
                                                    candidate.identifiers.chembl_id
                                                ]
                                            })
                                        ]
                                    }, candidate.identifiers.chembl_id ?? candidate.canonical_name))
                            }),
                            result.profile_id && /*#__PURE__*/ _jsxs("p", {
                                children: [
                                    "Reviewed profile: ",
                                    result.profile_id,
                                    " · version ",
                                    result.profile_version,
                                    ". Target: ",
                                    result.resolved_target,
                                    "."
                                ]
                            }),
                            Object.keys(result.defaults_applied ?? {}).length > 0 && /*#__PURE__*/ _jsxs("details", {
                                children: [
                                    /*#__PURE__*/ _jsx("summary", {
                                        children: "Defaults used for this assessment"
                                    }),
                                    /*#__PURE__*/ _jsx("ul", {
                                        children: Object.entries(result.defaults_applied ?? {}).map(([key, value])=>/*#__PURE__*/ _jsxs("li", {
                                                children: [
                                                    key,
                                                    ": ",
                                                    value
                                                ]
                                            }, key))
                                    })
                                ]
                            }),
                            result.capabilities?.map((capability)=>/*#__PURE__*/ _jsxs("details", {
                                    children: [
                                        /*#__PURE__*/ _jsx("summary", {
                                            children: "Reviewed model capabilities and limits"
                                        }),
                                        /*#__PURE__*/ _jsxs("p", {
                                            children: [
                                                "Routes: ",
                                                capability.supported_routes.join(", "),
                                                " · endpoints: ",
                                                capability.supported_endpoints.join(", "),
                                                " · maximum duration: ",
                                                capability.maximum_duration_h,
                                                " hours"
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("p", {
                                            children: [
                                                "Adjustable fields: ",
                                                capability.adjustable_fields.join(", ")
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsx("ul", {
                                            children: capability.limitations.map((item)=>/*#__PURE__*/ _jsx("li", {
                                                    children: item
                                                }, item))
                                        })
                                    ]
                                }, capability.model_id)),
                            /*#__PURE__*/ _jsx("p", {
                                className: "scope-note",
                                children: result.model_eligible ? "The reviewed model matches these structured fields. A validated experiment still needs to be configured; use the existing antibody research example below." : "No new simulation has been approved or generated. Your current experiment is unchanged."
                            }),
                            /*#__PURE__*/ _jsxs("details", {
                                children: [
                                    /*#__PURE__*/ _jsx("summary", {
                                        children: "Assessment record"
                                    }),
                                    /*#__PURE__*/ _jsx("pre", {
                                        children: JSON.stringify(result, null, 2)
                                    })
                                ]
                            })
                        ]
                    })
                ]
            })
        ]
    });
}
