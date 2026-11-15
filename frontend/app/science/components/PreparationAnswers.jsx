"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { parameterLabel, unitLabel } from "../lib/investigation.js";
import { humanize, locatorLabel } from "../lib/readable.js";
const FIELDS = [
    [
        "pk.volume_L",
        "Effective distribution volume",
        "L"
    ],
    [
        "pk.clearance_L_h",
        "Effective clearance",
        "L/hour"
    ],
    [
        "binding.association_nM_inv_h_inv",
        "Association rate",
        "nM^-1 hour^-1"
    ],
    [
        "binding.dissociation_h_inv",
        "Dissociation rate",
        "hour^-1"
    ],
    [
        "molecular_weight_g_mol",
        "Molecular weight for the specified form",
        "g/mol"
    ],
    [
        "body_mass_kg",
        "Body mass",
        "kg"
    ],
    [
        "exposure_factor",
        "Prescribed target-site / central exposure factor",
        "1"
    ]
];
export function PreparationAnswers({ record, busy, onContinue, onReload }) {
    const [values, setValues] = useState({});
    const [rationale, setRationale] = useState(record.scope?.rationale ?? "");
    const [form, setForm] = useState(record.scope?.molecular_form ?? record.identity_molecular_form ?? "");
    const [species, setSpecies] = useState(record.scope?.species ?? "");
    const [compartment, setCompartment] = useState(record.scope?.target_compartment ?? "");
    const [binding, setBinding] = useState(record.scope?.binding_regime ?? "unknown");
    const [pk, setPk] = useState(record.scope?.pk_regime ?? "unknown");
    const [competition, setCompetition] = useState(record.scope?.competition ?? "unknown");
    const [duration, setDuration] = useState(record.design?.duration_h.toString() ?? "");
    const [dose, setDose] = useState(record.design?.administration[0]?.amount_mg.toString() ?? "");
    const [infusion, setInfusion] = useState("1");
    const [route, setRoute] = useState(record.preparation.request.route ?? "");
    const [declared, setDeclared] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState(null);
    const prep = record.preparation;
    const unresolved = [
        "not_found",
        "unavailable",
        "ambiguous"
    ].includes(record.identity_status);
    function submit(event) {
        event.preventDefault();
        setError(null);
        try {
            if (!confirmed || !rationale.trim()) throw new Error("Confirm your assumptions and provide their rationale.");
            const update = {
                base_revision: prep.revision,
                base_evidence_sha256: prep.evidence_sha256,
                parameters: []
            };
            if (unresolved && declared && (!form.trim() || !species.trim() || !compartment)) throw new Error("Declare the hypothetical molecular form, species and compartment first.");
            if (unresolved && declared) {
                update.declare_hypothetical_identity = true;
                update.identity_rationale = rationale;
            }
            const exposureCompartment = compartment || record.scope?.target_compartment;
            for (const [field, , unit] of FIELDS){
                if (!values[field]?.trim()) continue;
                const value = Number(values[field]);
                if (!Number.isFinite(value) || (field === "exposure_factor" ? value < 0 : value <= 0)) throw new Error("Enter finite positive values (exposure may be zero).");
                if (!exposureCompartment) throw new Error("Declare a target compartment for assumed parameters.");
                const parameterId = `answer-${crypto.randomUUID()}`;
                update.selected_parameters ??= {};
                update.selected_parameters[field] = parameterId;
                update.parameters.push({
                    parameter_id: parameterId,
                    parameter: field,
                    value,
                    unit,
                    original_value: value,
                    original_unit: unit,
                    applicability: "candidate",
                    formula: null,
                    normalization: "Researcher entered canonical units",
                    provenance: "researcher_assumed",
                    rationale,
                    entered_at: new Date().toISOString(),
                    context: {
                        drug_identifier: prep.resolved_drug_identifier ?? `user:${record.identity_molecular_form ?? form}`,
                        target_identifier: prep.resolved_target_identifier,
                        assay_conditions: null,
                        experimental_system: null,
                        formulation: null,
                        route: null,
                        molecular_form: form,
                        species: species || null,
                        exposure_compartment: exposureCompartment,
                        applicability_notes: [
                            rationale
                        ]
                    }
                });
            }
            if (update.parameters.some((p)=>p.parameter.startsWith("binding."))) update.selected_parameters["binding.affinity_nM"] = null;
            if (update.parameters.some((p)=>p.parameter.startsWith("pk."))) update.selected_parameters["pk.elimination_half_life_h"] = null;
            // Hypothetical identity is resolved by the server before numerical assumptions are submitted.
            if (unresolved && declared && update.parameters.length) throw new Error("First declare the hypothetical identity with blank numerical fields. Then enter assumptions using its returned identifier.");
            if (form && species && compartment) update.scope = {
                molecular_form: form,
                species,
                target_compartment: compartment,
                binding_regime: binding,
                pk_regime: pk,
                competition,
                rationale
            };
            if (duration || dose) {
                const hours = Number(duration), amount = Number(dose), infusionHours = Number(infusion);
                if (!duration || !dose || !Number.isFinite(hours) || hours <= 0 || !Number.isFinite(amount) || amount < 0) throw new Error("Specify a positive duration and nonnegative amount in mg.");
                if (![
                    "iv_infusion",
                    "hypothetical_iv_bolus"
                ].includes(route)) throw new Error("Choose an explicit supported IV input.");
                if (route === "iv_infusion" && (!Number.isFinite(infusionHours) || infusionHours <= 0)) throw new Error("Specify a positive infusion duration.");
                update.design = {
                    duration_h: hours,
                    initial_amount_nmol: record.design?.initial_amount_nmol ?? 0,
                    initial_occupancy: record.design?.initial_occupancy ?? 0,
                    occupancy_threshold: record.design?.occupancy_threshold ?? 0.9,
                    administration: route === "iv_infusion" ? [
                        {
                            kind: "infusion",
                            start_h: 0,
                            duration_h: infusionHours,
                            amount_mg: amount
                        }
                    ] : [
                        {
                            kind: "hypothetical_bolus",
                            start_h: 0,
                            amount_mg: amount
                        }
                    ],
                    rationale
                };
            }
            const routeQuestion = (prep.missing_inputs ?? []).find((q)=>q.input_id === "route");
            if (routeQuestion && route) update.answers = {
                route
            };
            if (!update.scope && !update.design && !update.parameters.length && !declared && !update.answers) throw new Error("Supply an answer, scope or design before continuing.");
            onContinue(update);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Check your inputs.");
        }
    }
    return /*#__PURE__*/ _jsxs("section", {
        className: "interpretation-panel",
        "aria-label": "Evidence and missing inputs",
        children: [
            /*#__PURE__*/ _jsx("h2", {
                children: "Review evidence & complete the experiment"
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    "Preparation: ",
                    /*#__PURE__*/ _jsx("code", {
                        children: prep.preparation_id
                    }),
                    " · version ",
                    prep.revision
                ]
            }),
            /*#__PURE__*/ _jsxs("p", {
                children: [
                    /*#__PURE__*/ _jsx("strong", {
                        children: prep.state
                    }),
                    " · identity ",
                    record.identity_status,
                    " · lookup ",
                    record.identity_retrieval_status,
                    ". Inputs remain conditional candidates."
                ]
            }),
            /*#__PURE__*/ _jsx("ul", {
                children: prep.reasons.map((r)=>/*#__PURE__*/ _jsx("li", {
                        children: r
                    }, r))
            }),
            /*#__PURE__*/ _jsx("ul", {
                children: (prep.missing_inputs ?? []).map((q)=>/*#__PURE__*/ _jsxs("li", {
                        children: [
                            /*#__PURE__*/ _jsx("strong", {
                                children: q.parameter
                            }),
                            ": ",
                            q.question,
                            " ",
                            q.expected_unit && `(${q.expected_unit})`
                        ]
                    }, q.input_id))
            }),
            /*#__PURE__*/ _jsxs("details", {
                children: [
                    /*#__PURE__*/ _jsxs("summary", {
                        children: [
                            "Extracted values, assumptions & source access (",
                            (prep.parameters ?? []).length,
                            " values)"
                        ]
                    }),
                    (prep.parameters ?? []).map((p)=>/*#__PURE__*/ _jsxs("article", {
                            children: [
                                /*#__PURE__*/ _jsxs("strong", {
                                    children: [
                                        parameterLabel(p.parameter),
                                        ": ",
                                        p.value,
                                        " ",
                                        unitLabel(p.unit)
                                    ]
                                }),
                                " · ",
                                humanize(p.provenance),
                                " · ",
                                humanize(p.applicability),
                                /*#__PURE__*/ _jsx("p", {
                                    children: p.context.applicability_notes.join(" ")
                                }),
                                (p.passages ?? []).map((passage, i)=>/*#__PURE__*/ _jsxs("blockquote", {
                                        children: [
                                            passage.supporting_passage,
                                            " ",
                                            /*#__PURE__*/ _jsxs("small", {
                                                children: [
                                                    "(",
                                                    locatorLabel(passage.locator),
                                                    ")"
                                                ]
                                            })
                                        ]
                                    }, i))
                            ]
                        }, p.parameter_id)),
                    (prep.sources ?? []).map((s)=>/*#__PURE__*/ _jsxs("article", {
                            children: [
                                /*#__PURE__*/ _jsx("a", {
                                    href: s.url,
                                    target: "_blank",
                                    rel: "noreferrer",
                                    children: s.title
                                }),
                                /*#__PURE__*/ _jsxs("p", {
                                    children: [
                                        s.content_kind,
                                        " · ",
                                        s.retrieval_status,
                                        " · ",
                                        s.retrieved_at
                                    ]
                                })
                            ]
                        }, s.source_id))
                ]
            }),
            /*#__PURE__*/ _jsx("button", {
                type: "button",
                disabled: busy,
                onClick: onReload,
                children: "Reload preparation & latest version"
            }),
            prep.state === "unsupported" ? /*#__PURE__*/ _jsx("p", {
                children: "This mechanism cannot run in the implemented model. Start a new compatible research question."
            }) : /*#__PURE__*/ _jsx("form", {
                onSubmit: submit,
                children: /*#__PURE__*/ _jsxs("fieldset", {
                    disabled: busy,
                    style: {
                        border: 0,
                        padding: 0
                    },
                    children: [
                        /*#__PURE__*/ _jsx("p", {
                            children: "Blank fields preserve extracted inputs. Entered values explicitly replace the selected input for that field; original candidates remain in history. Each entered value is a hypothetical assumption, not a published measurement. Linked half-life and KD are calculated from compatible PK and kinetic pairs."
                        }),
                        unresolved && /*#__PURE__*/ _jsxs("label", {
                            children: [
                                /*#__PURE__*/ _jsx("input", {
                                    type: "checkbox",
                                    checked: declared,
                                    onChange: (e)=>setDeclared(e.target.checked)
                                }),
                                " Declare an unverified hypothetical identity (no database identity or measured parameters claimed)"
                            ]
                        }),
                        /*#__PURE__*/ _jsx("div", {
                            className: "form-grid",
                            children: FIELDS.map(([field, label, unit])=>/*#__PURE__*/ _jsxs("label", {
                                    children: [
                                        label,
                                        " (",
                                        unit,
                                        ")",
                                        /*#__PURE__*/ _jsx("input", {
                                            type: "number",
                                            step: "any",
                                            value: values[field] ?? "",
                                            onChange: (e)=>setValues({
                                                    ...values,
                                                    [field]: e.target.value
                                                }),
                                            placeholder: "No assumption supplied"
                                        })
                                    ]
                                }, field))
                        }),
                        /*#__PURE__*/ _jsxs("details", {
                            open: !record.scope,
                            children: [
                                /*#__PURE__*/ _jsx("summary", {
                                    children: "Explicit model scope"
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "form-grid",
                                    children: [
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Molecular form",
                                                /*#__PURE__*/ _jsx("input", {
                                                    value: form,
                                                    onChange: (e)=>setForm(e.target.value)
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Species",
                                                /*#__PURE__*/ _jsx("input", {
                                                    value: species,
                                                    onChange: (e)=>setSpecies(e.target.value),
                                                    placeholder: "Declare species"
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Target compartment",
                                                /*#__PURE__*/ _jsxs("select", {
                                                    value: compartment,
                                                    onChange: (e)=>setCompartment(e.target.value),
                                                    children: [
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "",
                                                            children: "Choose compartment"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "extracellular",
                                                            children: "Extracellular"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "intracellular",
                                                            children: "Intracellular (prescribed exposure only)"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "other",
                                                            children: "Other"
                                                        })
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Binding model",
                                                /*#__PURE__*/ _jsxs("select", {
                                                    value: binding,
                                                    onChange: (e)=>setBinding(e.target.value),
                                                    children: [
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "unknown",
                                                            children: "Not established"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "reversible_1_to_1",
                                                            children: "Effective reversible 1:1"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "irreversible",
                                                            children: "Irreversible (unsupported)"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "cooperative",
                                                            children: "Cooperative (unsupported)"
                                                        })
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "PK regime",
                                                /*#__PURE__*/ _jsxs("select", {
                                                    value: pk,
                                                    onChange: (e)=>setPk(e.target.value),
                                                    children: [
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "unknown",
                                                            children: "Not established"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "linear_effective",
                                                            children: "Effective linear one compartment"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "other",
                                                            children: "Other (unsupported)"
                                                        })
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Competition",
                                                /*#__PURE__*/ _jsxs("select", {
                                                    value: competition,
                                                    onChange: (e)=>setCompetition(e.target.value),
                                                    children: [
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "unknown",
                                                            children: "Not established"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "absent_assumed",
                                                            children: "Explicitly assume absent"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "effective_assay_rates",
                                                            children: "Rates include declared assay effects"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "requires_explicit_model",
                                                            children: "Requires explicit model (unsupported)"
                                                        })
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("details", {
                            open: !record.design,
                            children: [
                                /*#__PURE__*/ _jsx("summary", {
                                    children: "Baseline administration & observation window"
                                }),
                                /*#__PURE__*/ _jsx("p", {
                                    children: "New baselines start with zero free drug and zero occupancy; the analytical threshold is 0.9. Existing initial conditions are preserved. Doses below are hypothetical design inputs."
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "form-grid",
                                    children: [
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Input route",
                                                /*#__PURE__*/ _jsxs("select", {
                                                    disabled: !!record.preparation.request.route && !(prep.missing_inputs ?? []).some((q)=>q.input_id === "route"),
                                                    value: route,
                                                    onChange: (e)=>setRoute(e.target.value),
                                                    children: [
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "",
                                                            children: "Choose IV input"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "iv_infusion",
                                                            children: "IV infusion"
                                                        }),
                                                        /*#__PURE__*/ _jsx("option", {
                                                            value: "hypothetical_iv_bolus",
                                                            children: "Hypothetical IV bolus"
                                                        })
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Amount (mg)",
                                                /*#__PURE__*/ _jsx("input", {
                                                    type: "number",
                                                    min: "0",
                                                    step: "any",
                                                    value: dose,
                                                    onChange: (e)=>setDose(e.target.value)
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Duration (hours)",
                                                /*#__PURE__*/ _jsx("input", {
                                                    type: "number",
                                                    min: "0",
                                                    step: "any",
                                                    value: duration,
                                                    onChange: (e)=>setDuration(e.target.value)
                                                })
                                            ]
                                        }),
                                        route === "iv_infusion" && /*#__PURE__*/ _jsxs("label", {
                                            children: [
                                                "Infusion duration (hours)",
                                                /*#__PURE__*/ _jsx("input", {
                                                    type: "number",
                                                    min: "0",
                                                    step: "any",
                                                    value: infusion,
                                                    onChange: (e)=>setInfusion(e.target.value)
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("label", {
                            children: [
                                "Assumption / design rationale",
                                /*#__PURE__*/ _jsx("textarea", {
                                    required: true,
                                    value: rationale,
                                    onChange: (e)=>setRationale(e.target.value)
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("label", {
                            children: [
                                /*#__PURE__*/ _jsx("input", {
                                    required: true,
                                    type: "checkbox",
                                    checked: confirmed,
                                    onChange: (e)=>setConfirmed(e.target.checked)
                                }),
                                " I explicitly authorize this structured baseline and the hypothetical values/scope I supplied. Occupancy is not clinical efficacy."
                            ]
                        }),
                        error && /*#__PURE__*/ _jsx("p", {
                            role: "alert",
                            children: error
                        }),
                        /*#__PURE__*/ _jsx("button", {
                            className: "primary-button",
                            disabled: busy,
                            children: "Apply answers & continue research"
                        })
                    ]
                })
            })
        ]
    });
}
