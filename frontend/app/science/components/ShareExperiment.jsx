"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { SignInPrompt } from "./AccountMenu.jsx";
/** Publish an immutable snapshot of the displayed investigation to the community feed. */ export function ShareExperiment({ resultId, defaultTitle, busy }) {
    const { enabled, user } = useAuth();
    const [open, setOpen] = useState(false), [title, setTitle] = useState(defaultTitle.slice(0, 160)), [note, setNote] = useState("");
    const [publishing, setPublishing] = useState(false), [shared, setShared] = useState(null), [error, setError] = useState(null);
    useEffect(()=>{
        setShared(null);
        setError(null);
    }, [
        resultId
    ]);
    useEffect(()=>{
        if (!open) setTitle(defaultTitle.slice(0, 160));
    }, [
        defaultTitle,
        open
    ]);
    if (!resultId) return null;
    async function publish(event) {
        event.preventDefault();
        setPublishing(true);
        setError(null);
        try {
            const response = await fetch("/api/shares", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                cache: "no-store",
                body: JSON.stringify({
                    result_id: resultId,
                    title: title.trim() || null,
                    note: note.trim() || null,
                    question: defaultTitle.slice(0, 700) || null
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Sharing failed. Try again.");
            setShared(data);
            setOpen(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Sharing failed. Try again.");
        } finally{
            setPublishing(false);
        }
    }
    const link = shared ? `/shared/${shared.share_id}` : null;
    return /*#__PURE__*/ _jsxs("section", {
        id: "share",
        className: "share-panel",
        "aria-label": "Share your experiment",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "share-heading",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsx("p", {
                                className: "eyebrow",
                                children: "Community"
                            }),
                            /*#__PURE__*/ _jsx("h2", {
                                children: "Share your experiment"
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                children: "Publish a read-only snapshot of this investigation: every step, its solver results, and an AI summary in which every statement cites the steps it comes from."
                            })
                        ]
                    }),
                    !shared && !open && (!enabled || user) && /*#__PURE__*/ _jsx("button", {
                        type: "button",
                        className: "primary-button",
                        disabled: busy,
                        onClick: ()=>setOpen(true),
                        children: "Share your experiment"
                    })
                ]
            }),
            /*#__PURE__*/ _jsx(SignInPrompt, {
                action: "share experiments with other researchers"
            }),
            open && /*#__PURE__*/ _jsxs("form", {
                onSubmit: publish,
                className: "share-form",
                children: [
                    /*#__PURE__*/ _jsxs("label", {
                        children: [
                            "Title",
                            /*#__PURE__*/ _jsx("input", {
                                required: true,
                                maxLength: 160,
                                value: title,
                                onChange: (e)=>setTitle(e.target.value)
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("label", {
                        children: [
                            "Note for readers (optional)",
                            /*#__PURE__*/ _jsx("textarea", {
                                maxLength: 1000,
                                rows: 3,
                                value: note,
                                onChange: (e)=>setNote(e.target.value),
                                placeholder: "What you were testing, or what you would try next"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "form-actions",
                        children: [
                            /*#__PURE__*/ _jsx("button", {
                                className: "primary-button",
                                disabled: publishing,
                                children: publishing ? "Publishing… writing the AI summary" : "Publish to community"
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                className: "quiet-button",
                                disabled: publishing,
                                onClick: ()=>setOpen(false),
                                children: "Cancel"
                            })
                        ]
                    })
                ]
            }),
            shared && link && /*#__PURE__*/ _jsxs("p", {
                className: "share-done",
                role: "status",
                children: [
                    "Shared. ",
                    /*#__PURE__*/ _jsx("a", {
                        href: link,
                        children: "Open the shared page →"
                    }),
                    " · ",
                    /*#__PURE__*/ _jsx("a", {
                        href: "/community",
                        children: "Community feed"
                    }),
                    shared.ai_summary.status !== "grounded" && /*#__PURE__*/ _jsxs("span", {
                        children: [
                            " · The AI summary was not published (",
                            shared.ai_summary.status,
                            "); readers see the log summary."
                        ]
                    })
                ]
            }),
            error && /*#__PURE__*/ _jsx("p", {
                role: "alert",
                children: error
            })
        ]
    });
}
