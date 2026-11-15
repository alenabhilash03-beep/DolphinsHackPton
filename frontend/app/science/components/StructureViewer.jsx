"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import Script from "next/script";
import StructureAnalysisTools from "../../structure-analysis-tools.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { STRUCTURES, TOUR, parseCoordinates, parseResidueLabel, residueKey, residueLabel, role, interfaceContacts, residueContacts } from "../lib/structure-geometry.js";
function selection(refs) {
    const keys = new Set(refs.map(residueKey));
    return {
        predicate: (atom)=>keys.has(residueKey({
                chain: atom.chain ?? "",
                resi: atom.resi ?? NaN,
                icode: atom.icode?.trim() ?? "",
                resn: atom.resn ?? ""
            }))
    };
}
export function StructureViewer({ kind = "trastuzumab", focusRequest = null }) {
    const profile = STRUCTURES[kind], imatinib = kind === "imatinib";
    const host = useRef(null), viewer = useRef(null), library = useRef(null);
    const motion = useRef(null);
    const [scriptReady, setScriptReady] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(null), [attempt, setAttempt] = useState(0);
    const [model, setModel] = useState(null), [verified, setVerified] = useState(false);
    const [visible, setVisible] = useState(profile.chains.map((c)=>c.id)), [surface, setSurface] = useState(false), [contacts, setContacts] = useState(true);
    const [selected, setSelected] = useState(null), [pair, setPair] = useState(null), [notice, setNotice] = useState("Click a protein residue or the imatinib ligand to inspect deposited geometry.");
    const [inspectChain, setInspectChain] = useState(imatinib ? "A" : "C"), [residueNumber, setResidueNumber] = useState(imatinib ? "315" : "557");
    const [step, setStep] = useState(-1), [playing, setPlaying] = useState(false), [systemReduced, setSystemReduced] = useState(false), [reduceMotion, setReduceMotion] = useState(false);
    const reduced = systemReduced || reduceMotion;
    const interfacePairs = useMemo(()=>model ? interfaceContacts(model.atoms, kind) : [], [
        model,
        kind
    ]);
    const neighbors = useMemo(()=>model && selected ? residueContacts(model.atoms, selected, kind) : [], [
        model,
        selected,
        kind
    ]);
    const own = useMemo(()=>model && selected ? model.atoms.filter((a)=>residueKey(a) === residueKey(selected)) : [], [
        model,
        selected
    ]);
    function cancelMotion() {
        if (motion.current !== null) cancelAnimationFrame(motion.current);
        motion.current = null;
    }
    function stop() {
        setPlaying(false);
        cancelMotion();
    }
    function focus(sel, context = false) {
        const v = viewer.current;
        if (!v || !v.selectedAtoms(sel).length) return;
        cancelMotion();
        const before = v.getView();
        v.zoomTo(sel);
        if (context) v.zoom(.65);
        const after = v.getView();
        if (reduced) {
            v.render();
            return;
        }
        v.setView(before);
        const started = performance.now();
        function frame(now) {
            const progress = Math.min(1, (now - started) / 600), ease = progress * progress * (3 - 2 * progress);
            // zoomTo changes translation/zoom, preserving rotation. Never interpolate atomic coordinates.
            const view = before.map((value, index)=>index < 4 ? value + (after[index] - value) * ease : after[index]);
            v.setView(view);
            v.render();
            motion.current = progress < 1 ? requestAnimationFrame(frame) : null;
        }
        motion.current = requestAnimationFrame(frame);
    }
    function choose(ref, focusResidue = false) {
        stop();
        setSelected(ref);
        setPair(null);
        setInspectChain(ref.chain);
        setResidueNumber(residueLabel(ref));
        setVisible((ids)=>[
                ...new Set([
                    ...ids,
                    ref.chain
                ])
            ]);
        setNotice(`Selected ${ref.resn} ${ref.chain}:${residueLabel(ref)}.`);
        if (focusResidue) focus(selection([
            ref
        ]), true);
    }
    function choosePair(contact) {
        stop();
        setSelected(contact.a);
        setPair(contact);
        setInspectChain(contact.a.chain);
        setResidueNumber(residueLabel(contact.a));
        setVisible((ids)=>[
                ...new Set([
                    ...ids,
                    contact.a.chain,
                    contact.b.chain
                ])
            ]);
        setNotice("Orange marks the selected residue; cyan marks its coordinate-derived counterpart. The line is a geometric measurement.");
        focus(selection([
            contact.a,
            contact.b
        ]), true);
    }
    function go(index) {
        const next = Math.max(0, Math.min(TOUR.length - 1, index));
        setStep(next);
        setNotice(TOUR[next].description);
        setContacts(true);
        setVisible(profile.chains.map((c)=>c.id));
        setPair(null);
        setSelected(null);
        if (next === 0) focus({
            hetflag: false
        });
        if (next === 1) focus(imatinib ? {
            chain: "A"
        } : {
            or: [
                {
                    chain: "A"
                },
                {
                    chain: "B"
                }
            ]
        });
        if (next === 2) focus(selection(interfacePairs.flatMap((p)=>[
                p.a,
                p.b
            ])));
        if (next === 3 && interfacePairs.length) {
            const contact = interfacePairs[0];
            setSelected(contact.a);
            setPair(contact);
            setInspectChain(contact.a.chain);
            setResidueNumber(residueLabel(contact.a));
            focus(selection([
                contact.a,
                contact.b
            ]), true);
        }
    }
    useEffect(()=>{
        const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
        const change = ()=>setSystemReduced(preference.matches);
        change();
        preference.addEventListener("change", change);
        return ()=>preference.removeEventListener("change", change);
    }, []);
    useEffect(()=>{
        if (reduced) {
            setPlaying(false);
            cancelMotion();
        }
    }, [
        reduced
    ]);
    useEffect(()=>{
        if (!playing || reduced) return;
        if (step >= TOUR.length - 1) {
            setPlaying(false);
            return;
        }
        const timer = setTimeout(()=>go(step + 1), 5500);
        return ()=>clearTimeout(timer);
    }, [
        playing,
        step,
        reduced
    ]);
    useEffect(()=>{
        if (!scriptReady || !host.current) return;
        const element = host.current, abort = new AbortController();
        let resize, instance;
        setLoaded(false);
        setVerified(false);
        setModel(null);
        setSelected(null);
        setPair(null);
        setStep(-1);
        setPlaying(false);
        const lib = window.$3Dmol;
        library.current = lib;
        void fetch(`/structures/${profile.id}.pdb`, {
            signal: abort.signal
        }).then(async (response)=>{
            if (!response.ok) throw new Error("Cached structure unavailable");
            const bytes = await response.arrayBuffer();
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b)=>b.toString(16).padStart(2, "0")).join("");
            if (digest !== profile.sha256) throw new Error("Experimental coordinate checksum mismatch");
            const pdb = new TextDecoder().decode(bytes), parsed = parseCoordinates(pdb);
            if (abort.signal.aborted) return;
            lib.setSyncSurface(true);
            instance = lib.createViewer(element, {
                backgroundColor: "#151617",
                antialias: true
            });
            instance.addModel(pdb, "pdb");
            const bySerial = new Map(parsed.atoms.map((a)=>[
                    a.serial,
                    a
                ]));
            const click = (atom)=>{
                const ref = bySerial.get(atom.serial ?? -1);
                if (ref && role(ref, kind)) choose(ref);
            };
            instance.setClickable({
                hetflag: false
            }, true, click);
            if (imatinib) instance.setClickable({
                resn: "STI"
            }, true, click);
            viewer.current = instance;
            instance.zoomTo({
                hetflag: false
            });
            instance.render();
            resize = new ResizeObserver(()=>{
                if (!element.clientWidth || !element.clientHeight) {
                    stop();
                    return;
                }
                instance?.resize();
                instance?.render();
            });
            resize.observe(element);
            setModel(parsed);
            setVerified(true);
            setLoaded(true);
        }).catch(()=>{
            if (!abort.signal.aborted) setError("Experimental structure could not be verified or rendered. Scientific plots remain usable. Check the cached asset and WebGL support.");
        });
        return ()=>{
            abort.abort();
            cancelMotion();
            resize?.disconnect();
            instance?.clear();
            viewer.current = null;
            element.replaceChildren();
        };
    }, [
        scriptReady,
        attempt,
        profile.id
    ]);
    useEffect(()=>{
        const v = viewer.current;
        if (!loaded || !v || !library.current) return;
        v.setStyle({}, {});
        v.removeAllSurfaces();
        v.removeAllShapes();
        v.removeAllLabels();
        for (const chain of profile.chains.filter((c)=>visible.includes(c.id))){
            const sel = {
                chain: chain.id,
                hetflag: false
            };
            v.setStyle(sel, {
                cartoon: {
                    color: chain.color,
                    opacity: pair ? 0.28 : 1
                }
            });
            if (surface) void v.addSurface(library.current.SurfaceType.MS, {
                opacity: .28,
                color: chain.color
            }, sel);
        }
        if (contacts) {
            const refs = interfacePairs.flatMap((p)=>[
                    p.a,
                    p.b
                ]).filter((ref)=>visible.includes(ref.chain));
            if (refs.length) v.addStyle(selection(refs), {
                stick: {
                    radius: .15,
                    colorscheme: "element",
                    opacity: pair ? 0.25 : 1
                }
            });
        }
        if (imatinib) for (const chain of visible)v.setStyle({
            resn: "STI",
            chain
        }, {
            stick: {
                radius: .23,
                color: "#d6a64a"
            }
        });
        if (selected && visible.includes(selected.chain)) v.addStyle(selection([
            selected
        ]), {
            stick: {
                radius: .25,
                color: "#e36536",
                opacity: 1
            }
        });
        if (pair && visible.includes(pair.a.chain) && visible.includes(pair.b.chain)) {
            v.addStyle(selection([
                pair.b
            ]), {
                stick: {
                    radius: .23,
                    color: "#18a4ad",
                    opacity: 1
                }
            });
            v.addStyle({
                serial: pair.a.serial
            }, {
                sphere: {
                    radius: .32,
                    color: "#e36536"
                }
            });
            v.addStyle({
                serial: pair.b.serial
            }, {
                sphere: {
                    radius: .32,
                    color: "#18a4ad"
                }
            });
            v.addLine({
                start: {
                    x: pair.a.x,
                    y: pair.a.y,
                    z: pair.a.z
                },
                end: {
                    x: pair.b.x,
                    y: pair.b.y,
                    z: pair.b.z
                },
                color: "#c7bcae",
                linewidth: 3
            });
            v.addLabel(`${pair.distance.toFixed(2)} Å`, {
                position: {
                    x: (pair.a.x + pair.b.x) / 2,
                    y: (pair.a.y + pair.b.y) / 2,
                    z: (pair.a.z + pair.b.z) / 2
                },
                fontSize: 15,
                inFront: true,
                backgroundColor: "#ffffff",
                fontColor: "#18283e",
                backgroundOpacity: .9
            });
        }
        v.render();
    }, [
        loaded,
        visible,
        surface,
        contacts,
        selected,
        pair,
        interfacePairs,
        profile,
        imatinib
    ]);
    // An agent measurement asks the viewer to show the same residue pair. The viewer recomputes the distance itself.
    useEffect(()=>{
        if (!focusRequest || !loaded || !model) return;
        if (focusRequest.pdbId !== profile.id) {
            setNotice(`Measurement ${focusRequest.label} belongs to PDB ${focusRequest.pdbId}, not the structure shown here.`);
            return;
        }
        const at = (ref)=>(a)=>a.chain === ref.chain && a.resi === ref.resi && a.icode === ref.icode;
        const start = model.atoms.find((a)=>at(focusRequest.drug)(a) && role(a, kind) === "drug");
        const contact = start ? residueContacts(model.atoms, start, kind).find((c)=>at(focusRequest.target)(c.b)) : undefined;
        if (!contact) {
            stop();
            setSelected(null);
            setPair(null);
            setNotice(`Measurement ${focusRequest.label} could not be located in these coordinates. Nothing is highlighted.`);
            return;
        }
        setStep(-1);
        setContacts(true);
        choosePair(contact);
        setNotice(`Agent measurement ${focusRequest.label}: ${contact.a.resn} ${contact.a.chain}:${residueLabel(contact.a)} ↔ ${contact.b.resn} ${contact.b.chain}:${residueLabel(contact.b)}. The distance shown is recomputed here from the same deposited coordinates.`);
    }, [
        focusRequest?.nonce,
        loaded,
        model
    ]);
    function inspect() {
        try {
            const ref = parseResidueLabel(residueNumber), found = model?.atoms.find((a)=>a.protein && a.chain === inspectChain && a.resi === ref.resi && a.icode === ref.icode);
            if (found) {
                choose(found, true);
                return;
            }
            stop();
            setSelected(null);
            setPair(null);
            const missing = model?.unresolved.find((a)=>a.chain === inspectChain && a.resi === ref.resi && a.icode === ref.icode);
            setNotice(missing ? `${missing.resn} ${inspectChain}:${residueLabel(missing)} is listed as unresolved in depositor REMARK 465. No atoms or side chains are reconstructed.` : `No resolved coordinates for ${inspectChain}:${residueNumber}. It may be outside the construct, absent or unresolved; the reason is not inferred.`);
        } catch (e) {
            setNotice(e instanceof Error ? e.message : "Check the residue identifier.");
        }
    }
    useEffect(()=>{
        const pause = ()=>stop();
        const frame = (event)=>{
            if (event.detail?.pdb !== profile.id) return;
            const { drug, target } = event.detail;
            const match = (atom, ref)=>atom.chain === ref.chain && atom.resi === ref.residue_number && (atom.icode || "") === (ref.insertion_code || "");
            const contact = interfacePairs.find((pair)=>match(pair.a, drug) && match(pair.b, target));
            if (contact) choosePair(contact);
        };
        window.addEventListener("hypothesim:pause-visuals", pause);
        window.addEventListener("hypothesim:focus-contact", frame);
        return ()=>{
            window.removeEventListener("hypothesim:pause-visuals", pause);
            window.removeEventListener("hypothesim:focus-contact", frame);
        };
    }, [
        interfacePairs,
        profile.id
    ]);
    const entity = selected && own.length ? role(own[0], kind) === "drug" ? imatinib ? "Imatinib ligand (STI)" : "Trastuzumab Fab" : "Target protein" : null;
    return /*#__PURE__*/ _jsxs("section", {
        id: "structure",
        className: "structure-panel",
        "aria-label": "Experimental molecular structure",
        children: [
            /*#__PURE__*/ _jsx(Script, {
                src: `/vendor/3Dmol-2.5.5.min.js?attempt=${attempt}`,
                onReady: ()=>setScriptReady(true),
                onError: ()=>setError("Molecular renderer unavailable. Scientific plots remain usable.")
            }, attempt),
            /*#__PURE__*/ _jsx("p", {
                className: "eyebrow",
                children: "03 / Experimental geometry"
            }),
            /*#__PURE__*/ _jsxs("h2", {
                children: [
                    "Experimental structure · ",
                    profile.id
                ]
            }),
            /*#__PURE__*/ _jsxs("details", {
                className: "structure-context",
                children: [
                    /*#__PURE__*/ _jsx("summary", {
                        children: "Structure notes"
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        children: [
                            profile.description,
                            ". ",
                            profile.scope,
                            " Dose, affinity and playback never deform these coordinates."
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "molecular-tour",
                "aria-label": "Guided molecular tour",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "form-actions",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                disabled: !loaded,
                                onClick: ()=>{
                                    go(0);
                                    setPlaying(!reduced);
                                },
                                children: "Start guided tour"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                disabled: !playing,
                                onClick: stop,
                                children: "Pause tour"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                disabled: !loaded || step <= 0,
                                onClick: ()=>{
                                    stop();
                                    go(step - 1);
                                },
                                children: "Previous stop"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                disabled: !loaded || step >= TOUR.length - 1,
                                onClick: ()=>{
                                    stop();
                                    go(step + 1);
                                },
                                children: "Next stop"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("label", {
                        children: [
                            /*#__PURE__*/ _jsx("input", {
                                type: "checkbox",
                                checked: reduced,
                                disabled: systemReduced,
                                onChange: (e)=>setReduceMotion(e.target.checked)
                            }),
                            " Reduce camera motion"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        "aria-live": "polite",
                        children: step < 0 ? "Four stops: assembly → partners → interface → measured contact." : `Stop ${step + 1} of ${TOUR.length} · ${TOUR[step].title}. ${TOUR[step].description}`
                    }),
                    reduced && /*#__PURE__*/ _jsx("p", {
                        children: "Reduced motion: camera framing is immediate. Advance with Next stop; auto-advance is disabled."
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "structure-tools",
                children: profile.chains.map((chain)=>/*#__PURE__*/ _jsxs("label", {
                        style: {
                            borderLeft: `3px solid ${chain.color}`,
                            paddingLeft: 8
                        },
                        children: [
                            /*#__PURE__*/ _jsx("input", {
                                type: "checkbox",
                                checked: visible.includes(chain.id),
                                onChange: ()=>{
                                    stop();
                                    setVisible((ids)=>ids.includes(chain.id) ? ids.filter((id)=>id !== chain.id) : [
                                            ...ids,
                                            chain.id
                                        ]);
                                }
                            }),
                            chain.id,
                            ": ",
                            chain.label
                        ]
                    }, chain.id))
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "form-actions",
                children: [
                    /*#__PURE__*/ _jsxs("label", {
                        children: [
                            /*#__PURE__*/ _jsx("input", {
                                type: "checkbox",
                                checked: surface,
                                onChange: (e)=>{
                                    stop();
                                    setSurface(e.target.checked);
                                }
                            }),
                            " Molecular surfaces"
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("label", {
                        children: [
                            /*#__PURE__*/ _jsx("input", {
                                type: "checkbox",
                                checked: contacts,
                                onChange: (e)=>{
                                    stop();
                                    setContacts(e.target.checked);
                                }
                            }),
                            " Interface residues within 4 Å"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("button", {
                        disabled: !loaded,
                        onClick: ()=>{
                            const uri = viewer.current?.pngURI();
                            if (uri) {
                                const link = document.createElement("a");
                                link.href = uri;
                                link.download = profile.id + "-structure.png";
                                link.click();
                            }
                        },
                        children: "Save molecule PNG"
                    }),
                    /*#__PURE__*/ _jsx("button", {
                        disabled: !loaded,
                        onClick: ()=>{
                            stop();
                            setStep(-1);
                            focus({
                                hetflag: false
                            });
                        },
                        children: "Reset camera"
                    }),
                    /*#__PURE__*/ _jsx("button", {
                        disabled: !loaded,
                        onClick: ()=>{
                            stop();
                            focus(imatinib ? {
                                chain: "A"
                            } : {
                                or: [
                                    {
                                        chain: "A"
                                    },
                                    {
                                        chain: "B"
                                    }
                                ]
                            });
                        },
                        children: imatinib ? "Focus kinase copy A" : "Focus Fab"
                    }),
                    /*#__PURE__*/ _jsx("button", {
                        disabled: !loaded,
                        onClick: ()=>{
                            stop();
                            focus(imatinib ? {
                                resn: "STI",
                                chain: "A"
                            } : {
                                chain: "C"
                            });
                        },
                        children: imatinib ? "Focus imatinib copy A" : "Focus HER2"
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "structure-inspection-layout",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("div", {
                                ref: host,
                                onPointerDown: stop,
                                onWheel: stop,
                                "aria-label": `Interactive ${profile.id} molecular canvas`,
                                className: "molecular-canvas"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                children: "Drag to rotate; scroll to zoom. Manual canvas interaction pauses the tour."
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("aside", {
                        className: "residue-sidebar",
                        "aria-label": "Coordinate inspection sidebar",
                        children: [
                            /*#__PURE__*/ _jsx("h3", {
                                children: "Inspect the experimental interface"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                children: "Geometric proximity only; no binding energy or affinity is inferred."
                            }),
                            /*#__PURE__*/ _jsxs("form", {
                                onSubmit: (e)=>{
                                    e.preventDefault();
                                    inspect();
                                },
                                children: [
                                    /*#__PURE__*/ _jsxs("label", {
                                        children: [
                                            "Inspect chain",
                                            /*#__PURE__*/ _jsx("select", {
                                                value: inspectChain,
                                                onChange: (e)=>setInspectChain(e.target.value),
                                                children: profile.chains.map((c)=>/*#__PURE__*/ _jsx("option", {
                                                        children: c.id
                                                    }, c.id))
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("label", {
                                        children: [
                                            "Author residue number",
                                            /*#__PURE__*/ _jsx("input", {
                                                value: residueNumber,
                                                onChange: (e)=>setResidueNumber(e.target.value),
                                                placeholder: "557 or 100A"
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        disabled: !loaded,
                                        children: "Inspect residue"
                                    })
                                ]
                            }),
                            imatinib && /*#__PURE__*/ _jsx("button", {
                                disabled: !loaded,
                                onClick: ()=>{
                                    const ligand = model?.atoms.find((a)=>a.resn === "STI" && a.chain === "A");
                                    if (ligand) choose(ligand, true);
                                },
                                children: "Inspect imatinib ligand"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                role: "status",
                                children: error ?? (!loaded ? "Loading and verifying experimental coordinates…" : notice)
                            }),
                            selected && /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    /*#__PURE__*/ _jsxs("h4", {
                                        children: [
                                            selected.resn,
                                            " ",
                                            selected.chain,
                                            ":",
                                            residueLabel(selected)
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            entity,
                                            " · ",
                                            own.length,
                                            " resolved heavy atoms. Atom completeness is not inferred."
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("h4", {
                                        children: "Nearest opposite-partner residues"
                                    }),
                                    /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            "Minimum heavy-atom distance per counterpart, in Å",
                                            imatinib ? "; same crystal copy only" : "; Fab ↔ HER2 only",
                                            "."
                                        ]
                                    }),
                                    !neighbors.some((c)=>c.distance <= 4) && /*#__PURE__*/ _jsx("p", {
                                        children: "No opposite-partner residue within the 4 Å display cutoff."
                                    }),
                                    pair && /*#__PURE__*/ _jsxs("p", {
                                        className: "measurement-readout",
                                        children: [
                                            pair.a.resn,
                                            " ",
                                            pair.a.chain,
                                            ":",
                                            residueLabel(pair.a),
                                            " ",
                                            pair.a.atom,
                                            " ↔ ",
                                            pair.b.resn,
                                            " ",
                                            pair.b.chain,
                                            ":",
                                            residueLabel(pair.b),
                                            " ",
                                            pair.b.atom,
                                            ": ",
                                            /*#__PURE__*/ _jsxs("strong", {
                                                children: [
                                                    pair.distance.toFixed(3),
                                                    " Å"
                                                ]
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("ol", {
                                        className: "contact-list",
                                        children: neighbors.slice(0, 6).map((c)=>/*#__PURE__*/ _jsxs("li", {
                                                children: [
                                                    /*#__PURE__*/ _jsxs("button", {
                                                        onClick: ()=>choosePair(c),
                                                        children: [
                                                            c.b.resn,
                                                            " ",
                                                            c.b.chain,
                                                            ":",
                                                            residueLabel(c.b),
                                                            " · ",
                                                            c.distance.toFixed(2),
                                                            " Å"
                                                        ]
                                                    }),
                                                    /*#__PURE__*/ _jsxs("small", {
                                                        children: [
                                                            c.a.atom,
                                                            " ↔ ",
                                                            c.b.atom,
                                                            c.distance > 4 ? " · outside 4 Å" : " · within 4 Å"
                                                        ]
                                                    })
                                                ]
                                            }, residueKey(c.b)))
                                    })
                                ]
                            }),
                            !selected && loaded && /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    /*#__PURE__*/ _jsxs("p", {
                                        children: [
                                            interfacePairs.length,
                                            " residue pairs meet the 4 Å geometric cutoff."
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        disabled: !interfacePairs.length,
                                        onClick: ()=>choosePair(interfacePairs[0]),
                                        children: "Inspect closest interface pair"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "scope-note",
                                children: "These are coordinate-derived distances, not hydrogen-bond assignments, binding energies, KD, kon or koff. No residue-specific kinetic effect is inferred. Waters, glycans and hydrogens are excluded."
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsx(StructureAnalysisTools, {
                kind: kind
            }),
            error && /*#__PURE__*/ _jsx("button", {
                onClick: ()=>{
                    stop();
                    setError(null);
                    setLoaded(false);
                    setScriptReady(false);
                    setAttempt((n)=>n + 1);
                },
                children: "Retry structure"
            }),
            /*#__PURE__*/ _jsxs("details", {
                children: [
                    /*#__PURE__*/ _jsx("summary", {
                        children: "Experimental provenance & inspection limits"
                    }),
                    /*#__PURE__*/ _jsxs("p", {
                        children: [
                            verified ? "SHA-256 verified against the audited cached asset." : "Asset verification pending.",
                            " ",
                            profile.sha256
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        children: "Only the first deposited coordinate model is inspected. Alternate atom conformers are rejected rather than mixed. Missing coordinates and side chains are never synthesized. Distance rounding does not imply experimental precision."
                    }),
                    /*#__PURE__*/ _jsxs("a", {
                        href: `https://www.rcsb.org/structure/${profile.id}`,
                        target: "_blank",
                        rel: "noreferrer",
                        children: [
                            "RCSB PDB ",
                            profile.id,
                            " source ↗"
                        ]
                    })
                ]
            })
        ]
    });
}
