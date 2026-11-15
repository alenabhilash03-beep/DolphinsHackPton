"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Delve deeper: one paper, read on the left (a PDF rendered from its open-access text) and discussed on the
 * right with Nemotron, which answers only from that article's text and names the section it used.
 */ import { useEffect, useRef, useState } from "react";
const STARTERS = [
    "Summarise the key findings in three bullet points",
    "Which parameter values does it report, and where?",
    "What are the main limitations of this study?"
];
export function PaperReader({ paper, onClose }) {
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [pdf, setPdf] = useState("loading");
    const [kind, setKind] = useState(null);
    const [title, setTitle] = useState(paper.title);
    const log = useRef(null);
    const key = paper.key;
    useEffect(()=>{
        setMessages([]);
        setPdf("loading");
        setKind(null);
        setTitle(paper.title);
        // Some browsers never fire load for a framed PDF; never leave the overlay over a rendered document.
        const timer = window.setTimeout(()=>setPdf((state)=>state === "loading" ? "ready" : state), 6000);
        return ()=>window.clearTimeout(timer);
    }, [
        key
    ]);
    useEffect(()=>{
        // Warm the article (and learn whether it is full text or abstract only) while the PDF renders.
        let live = true;
        fetch(`/api/papers/${key}`, {
            cache: "no-store"
        }).then((r)=>r.ok ? r.json() : null).then((data)=>{
            if (live && data) {
                setKind(data.content_kind);
                if (typeof data.title === "string" && data.title) setTitle(data.title);
            }
        }).catch(()=>{});
        return ()=>{
            live = false;
        };
    }, [
        key
    ]);
    useEffect(()=>{
        log.current?.scrollTo({
            top: log.current.scrollHeight,
            behavior: "smooth"
        });
    }, [
        messages,
        busy
    ]);
    async function ask(question) {
        const text = question.trim();
        if (!text || busy) return;
        const history = [
            ...messages.filter((m)=>!m.failed),
            {
                role: "user",
                content: text
            }
        ];
        setMessages([
            ...messages,
            {
                role: "user",
                content: text
            }
        ]);
        setDraft("");
        setBusy(true);
        try {
            const response = await fetch(`/api/papers/${key}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                cache: "no-store",
                body: JSON.stringify({
                    messages: history.slice(-12).map(({ role, content })=>({
                            role,
                            content: content.slice(0, 4000)
                        }))
                })
            });
            const data = await response.json().catch(()=>({}));
            if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : typeof data.error === "string" ? data.error : "Nemotron is unavailable. Please ask again.");
            setMessages((current)=>[
                    ...current,
                    {
                        role: "assistant",
                        content: data.answer
                    }
                ]);
        } catch (error) {
            setMessages((current)=>[
                    ...current,
                    {
                        role: "assistant",
                        content: error instanceof Error ? error.message : "Nemotron is unavailable.",
                        failed: true
                    }
                ]);
        } finally{
            setBusy(false);
        }
    }
    const submit = (event)=>{
        event.preventDefault();
        void ask(draft);
    };
    return /*#__PURE__*/ _jsxs("section", {
        className: "paper-reader",
        "aria-label": `Reading ${paper.title}`,
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "paper-reader-doc",
                children: [
                    /*#__PURE__*/ _jsxs("header", {
                        className: "paper-reader-head",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsxs("p", {
                                        className: "paper-reader-eyebrow",
                                        children: [
                                            paper.identifiers.join(" · "),
                                            kind === "abstract" ? " · abstract only" : kind === "full_text" ? " · open-access full text" : ""
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("h2", {
                                        children: title
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "paper-reader-actions",
                                children: [
                                    paper.url && /*#__PURE__*/ _jsx("a", {
                                        className: "quiet-button",
                                        href: paper.url,
                                        target: "_blank",
                                        rel: "noreferrer",
                                        children: "Original ↗"
                                    }),
                                    /*#__PURE__*/ _jsx("a", {
                                        className: "quiet-button",
                                        href: `/api/papers/${key}/pdf`,
                                        target: "_blank",
                                        rel: "noreferrer",
                                        children: "Open PDF"
                                    }),
                                    /*#__PURE__*/ _jsx("button", {
                                        type: "button",
                                        className: "quiet-button",
                                        onClick: onClose,
                                        children: "Close reader"
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "paper-reader-frame",
                        "data-state": pdf,
                        children: [
                            /*#__PURE__*/ _jsx("iframe", {
                                title: `PDF of ${paper.title}`,
                                src: `/api/papers/${key}/pdf#view=FitH&toolbar=1`,
                                onLoad: ()=>setPdf("ready"),
                                onError: ()=>setPdf("failed")
                            }, key),
                            pdf === "loading" && /*#__PURE__*/ _jsxs("div", {
                                className: "paper-reader-loading",
                                role: "status",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {}),
                                    /*#__PURE__*/ _jsx("p", {
                                        children: "Rendering the article from its open-access text…"
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "paper-reader-note",
                        children: "Rendered by Hypothesim from the open-access text on Europe PMC (the publisher PDF cannot be embedded). Use “Original” for the publisher’s version."
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("aside", {
                className: "paper-chat",
                "aria-label": "Ask about this paper",
                children: [
                    /*#__PURE__*/ _jsxs("header", {
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                className: "agent-mark",
                                "aria-hidden": "true",
                                children: "N"
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        children: "Ask about this paper"
                                    }),
                                    /*#__PURE__*/ _jsx("p", {
                                        children: "NVIDIA Nemotron · answers only from this article"
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("ol", {
                        ref: log,
                        className: "paper-chat-log",
                        "aria-live": "polite",
                        children: [
                            !messages.length && /*#__PURE__*/ _jsxs("li", {
                                className: "paper-chat-intro",
                                children: [
                                    /*#__PURE__*/ _jsx("p", {
                                        children: "Ask anything about the methods, results or numbers in this article. Answers name the section they come from and say so when the article does not cover something."
                                    }),
                                    /*#__PURE__*/ _jsx("div", {
                                        className: "paper-chat-starters",
                                        children: STARTERS.map((starter)=>/*#__PURE__*/ _jsxs("button", {
                                                type: "button",
                                                disabled: busy,
                                                onClick: ()=>void ask(starter),
                                                children: [
                                                    starter,
                                                    /*#__PURE__*/ _jsx("span", {
                                                        "aria-hidden": "true",
                                                        children: "↗"
                                                    })
                                                ]
                                            }, starter))
                                    })
                                ]
                            }),
                            messages.map((message, index)=>/*#__PURE__*/ _jsxs("li", {
                                    className: "paper-chat-message",
                                    "data-role": message.role,
                                    "data-failed": message.failed || undefined,
                                    children: [
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "paper-chat-who",
                                            children: message.role === "user" ? "You" : "Nemotron"
                                        }),
                                        /*#__PURE__*/ _jsx("div", {
                                            children: message.content.split(/\n{1,}/).filter(Boolean).map((line, i)=>/*#__PURE__*/ _jsx("p", {
                                                    children: line
                                                }, i))
                                        })
                                    ]
                                }, index)),
                            busy && /*#__PURE__*/ _jsxs("li", {
                                className: "paper-chat-message",
                                "data-role": "assistant",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "paper-chat-who",
                                        children: "Nemotron"
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "paper-chat-typing",
                                        "aria-label": "Nemotron is reading the article",
                                        children: [
                                            /*#__PURE__*/ _jsx("i", {}),
                                            /*#__PURE__*/ _jsx("i", {}),
                                            /*#__PURE__*/ _jsx("i", {})
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("form", {
                        className: "paper-chat-form",
                        onSubmit: submit,
                        children: [
                            /*#__PURE__*/ _jsx("textarea", {
                                rows: 2,
                                value: draft,
                                maxLength: 4000,
                                placeholder: "Ask a question about this article…",
                                "aria-label": "Question about this article",
                                disabled: busy,
                                onChange: (event)=>setDraft(event.target.value),
                                onKeyDown: (event)=>{
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        void ask(draft);
                                    }
                                }
                            }),
                            /*#__PURE__*/ _jsxs("button", {
                                className: "primary-button",
                                disabled: busy || !draft.trim(),
                                children: [
                                    busy ? "Reading…" : "Ask",
                                    /*#__PURE__*/ _jsx("span", {
                                        "aria-hidden": "true",
                                        children: "↗"
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "paper-chat-note",
                        children: "AI answers can be wrong; check the quoted section in the PDF."
                    })
                ]
            })
        ]
    });
}
/** The Evidence tab's paper list with a "Delve deeper" action per paper. */ export function PaperList({ papers, onOpen }) {
    if (!papers.length) return null;
    return /*#__PURE__*/ _jsxs("section", {
        className: "paper-list",
        "aria-label": "Papers",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "paper-list-head",
                children: [
                    /*#__PURE__*/ _jsx("h2", {
                        children: "Papers"
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        children: "Open any paper to read it and ask Nemotron about it."
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("ul", {
                children: papers.map((paper)=>/*#__PURE__*/ _jsxs("li", {
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "paper-list-text",
                                children: [
                                    /*#__PURE__*/ _jsxs("span", {
                                        className: "paper-list-tags",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                children: paper.origin === "agent" ? "Read by the agent" : "Model input source"
                                            }),
                                            paper.access && /*#__PURE__*/ _jsx("span", {
                                                children: paper.access
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("strong", {
                                        children: paper.title
                                    }),
                                    paper.identifiers.length > 0 && /*#__PURE__*/ _jsx("small", {
                                        children: paper.identifiers.join(" · ")
                                    }),
                                    paper.usedFor && /*#__PURE__*/ _jsx("p", {
                                        children: paper.usedFor
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "paper-list-actions",
                                children: [
                                    paper.key ? /*#__PURE__*/ _jsxs("button", {
                                        type: "button",
                                        className: "primary-button",
                                        onClick: ()=>onOpen(paper),
                                        children: [
                                            "Delve deeper",
                                            /*#__PURE__*/ _jsx("span", {
                                                "aria-hidden": "true",
                                                children: "→"
                                            })
                                        ]
                                    }) : /*#__PURE__*/ _jsx("span", {
                                        className: "paper-list-unavailable",
                                        children: "No open text on Europe PMC"
                                    }),
                                    paper.url && /*#__PURE__*/ _jsx("a", {
                                        href: paper.url,
                                        target: "_blank",
                                        rel: "noreferrer",
                                        children: "Original ↗"
                                    })
                                ]
                            })
                        ]
                    }, paper.id))
            })
        ]
    });
}
