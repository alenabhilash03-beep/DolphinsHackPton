"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from "react";
/** Keep a renderer/chunk failure from discarding the scientific workspace. */ export class VisualizationBoundary extends Component {
    state = {
        failed: false,
        attempt: 0
    };
    static getDerivedStateFromError() {
        return {
            failed: true
        };
    }
    render() {
        if (this.state.failed) return /*#__PURE__*/ _jsxs("section", {
            role: "alert",
            children: [
                /*#__PURE__*/ _jsxs("h3", {
                    children: [
                        this.props.label,
                        " unavailable"
                    ]
                }),
                /*#__PURE__*/ _jsx("p", {
                    children: "The renderer could not load. The experiment data and other views remain available."
                }),
                /*#__PURE__*/ _jsx("button", {
                    type: "button",
                    onClick: ()=>this.setState({
                            failed: false,
                            attempt: this.state.attempt + 1
                        }),
                    children: "Retry this view"
                })
            ]
        });
        return /*#__PURE__*/ _jsx("div", {
            children: this.props.children
        }, this.state.attempt);
    }
}
