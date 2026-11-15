/** Line icons for the agent-workflow screen. 24×24, stroke = currentColor. */ import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const base = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
};
export const StageIcon = ({ id, size = 24 })=>{
    const props = {
        ...base,
        width: size,
        height: size
    };
    switch(id){
        case "question":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "12",
                        cy: "12",
                        r: "8.5"
                    }),
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "12",
                        cy: "12",
                        r: "4.5"
                    }),
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "12",
                        cy: "12",
                        r: "1",
                        fill: "currentColor"
                    })
                ]
            });
        case "search":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("rect", {
                        x: "3.5",
                        y: "3.5",
                        width: "10",
                        height: "13",
                        rx: "1.5"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M6 7h5M6 10h4"
                    }),
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "15.5",
                        cy: "15",
                        r: "3.5"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "m18 17.5 3 3"
                    })
                ]
            });
        case "reading":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("path", {
                        d: "M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M12 6.5v13"
                    })
                ]
            });
        case "extraction":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("path", {
                        d: "M5 3.5h9l4 4v13H5z"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M14 3.5v4h4"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M8 11h7",
                        strokeWidth: "3",
                        stroke: "currentColor",
                        opacity: ".35"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M8 15h5"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "m16.5 16.5 4 0m-1.5-1.5 1.5 1.5-1.5 1.5"
                    })
                ]
            });
        case "model":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("rect", {
                        x: "3",
                        y: "8",
                        width: "7",
                        height: "8",
                        rx: "2"
                    }),
                    /*#__PURE__*/ _jsx("rect", {
                        x: "14",
                        y: "8",
                        width: "7",
                        height: "8",
                        rx: "2"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M10 11h4m-1.5-1.5L14 11l-1.5 1.5M14 14h-4m1.5 1.5L10 14l1.5-1.5"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M6.5 8V5M17.5 16v3"
                    })
                ]
            });
        case "simulation":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("path", {
                        d: "M3.5 20.5h17M3.5 20.5v-17"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M5 7c3 0 4 1 6 4s4 6 9 6"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "M5 5.5c4 0 6 .5 8 1.5s4 2 7 2",
                        opacity: ".55"
                    })
                ]
            });
        case "structure":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "6",
                        cy: "7",
                        r: "2"
                    }),
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "17",
                        cy: "5.5",
                        r: "2"
                    }),
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "12",
                        cy: "12.5",
                        r: "2.2"
                    }),
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "6.5",
                        cy: "18",
                        r: "2"
                    }),
                    /*#__PURE__*/ _jsx("circle", {
                        cx: "18",
                        cy: "17",
                        r: "2"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "m7.6 8.3 2.8 2.8M15.6 6.8l-2.5 4M10.6 14.1l-2.6 2.4M14 13.6l2.4 2"
                    })
                ]
            });
        case "answer":
            return /*#__PURE__*/ _jsxs("svg", {
                ...props,
                children: [
                    /*#__PURE__*/ _jsx("path", {
                        d: "M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z"
                    }),
                    /*#__PURE__*/ _jsx("path", {
                        d: "m8.8 12 2.2 2.2 4.4-4.6"
                    })
                ]
            });
    }
};
export const AgentIcon = ({ size = 22 })=>/*#__PURE__*/ _jsxs("svg", {
        ...base,
        width: size,
        height: size,
        children: [
            /*#__PURE__*/ _jsx("rect", {
                x: "4.5",
                y: "6.5",
                width: "15",
                height: "12",
                rx: "3.5"
            }),
            /*#__PURE__*/ _jsx("path", {
                d: "M12 6.5V3.5M9 12h.01M15 12h.01M9.5 15.5h5"
            }),
            /*#__PURE__*/ _jsx("circle", {
                cx: "12",
                cy: "3",
                r: "1"
            }),
            /*#__PURE__*/ _jsx("path", {
                d: "M2.5 11v3M21.5 11v3"
            })
        ]
    });
export const DocIcon = ({ size = 18 })=>/*#__PURE__*/ _jsxs("svg", {
        ...base,
        width: size,
        height: size,
        children: [
            /*#__PURE__*/ _jsx("path", {
                d: "M6 3.5h8l4 4v13H6z"
            }),
            /*#__PURE__*/ _jsx("path", {
                d: "M14 3.5v4h4M9 12h6M9 15.5h4"
            })
        ]
    });
export const CheckIcon = ({ size = 14 })=>/*#__PURE__*/ _jsx("svg", {
        ...base,
        width: size,
        height: size,
        strokeWidth: 2.2,
        children: /*#__PURE__*/ _jsx("path", {
            d: "m5 12.5 4.5 4.5L19 7.5"
        })
    });
export const CrossIcon = ({ size = 14 })=>/*#__PURE__*/ _jsx("svg", {
        ...base,
        width: size,
        height: size,
        strokeWidth: 2.2,
        children: /*#__PURE__*/ _jsx("path", {
            d: "M6.5 6.5l11 11M17.5 6.5l-11 11"
        })
    });
export const ArrowIcon = ({ size = 16 })=>/*#__PURE__*/ _jsx("svg", {
        ...base,
        width: size,
        height: size,
        children: /*#__PURE__*/ _jsx("path", {
            d: "M4 12h15m-5-5 5 5-5 5"
        })
    });
export const BracesIcon = ({ size = 24 })=>/*#__PURE__*/ _jsx("svg", {
        ...base,
        width: size,
        height: size,
        children: /*#__PURE__*/ _jsx("path", {
            d: "M8.5 4c-2 0-2.5 1-2.5 2.5V10c0 1-.6 2-2 2 1.4 0 2 1 2 2v3.5C6 19 6.5 20 8.5 20M15.5 4c2 0 2.5 1 2.5 2.5V10c0 1 .6 2 2 2-1.4 0-2 1-2 2v3.5c0 1.5-.5 2.5-2.5 2.5"
        })
    });
export const ZoomIcon = ({ dir, size = 16 })=>/*#__PURE__*/ _jsxs("svg", {
        ...base,
        width: size,
        height: size,
        children: [
            /*#__PURE__*/ _jsx("circle", {
                cx: "10.5",
                cy: "10.5",
                r: "6"
            }),
            /*#__PURE__*/ _jsx("path", {
                d: "m15 15 5 5M8 10.5h5"
            }),
            dir === "in" && /*#__PURE__*/ _jsx("path", {
                d: "M10.5 8v5"
            })
        ]
    });
export const FitIcon = ({ size = 16 })=>/*#__PURE__*/ _jsx("svg", {
        ...base,
        width: size,
        height: size,
        children: /*#__PURE__*/ _jsx("path", {
            d: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
        })
    });
