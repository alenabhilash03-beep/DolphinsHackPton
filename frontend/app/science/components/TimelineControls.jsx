"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Accessible native controls that the visual UI can style or replace. */ export function TimelineControls({ timeline, className }) {
    return /*#__PURE__*/ _jsxs("div", {
        className: `timeline-panel ${className ?? ""}`,
        children: [
            /*#__PURE__*/ _jsx("button", {
                type: "button",
                onClick: timeline.toggle,
                disabled: timeline.maxIndex === 0,
                "aria-label": timeline.playing ? "Pause simulation" : "Play simulation",
                children: timeline.playing ? "Pause" : "Play"
            }),
            /*#__PURE__*/ _jsx("input", {
                type: "range",
                min: 0,
                max: timeline.horizonHours,
                step: "any",
                value: timeline.timeHours,
                onChange: (event)=>timeline.seekTime(Number(event.target.value)),
                "aria-label": "Simulation time",
                disabled: timeline.horizonHours === 0
            }),
            /*#__PURE__*/ _jsxs("output", {
                "aria-live": "off",
                children: [
                    timeline.timeDays.toFixed(2),
                    " days (",
                    timeline.timeHours.toFixed(1),
                    " hours)"
                ]
            }),
            /*#__PURE__*/ _jsxs("label", {
                className: "reveal-toggle",
                children: [
                    /*#__PURE__*/ _jsx("input", {
                        type: "checkbox",
                        checked: timeline.revealEnabled,
                        onChange: (event)=>timeline.setRevealEnabled(event.target.checked)
                    }),
                    " Reveal curves on play"
                ]
            })
        ]
    });
}
