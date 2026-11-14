"use client";
import { Component, type ReactNode } from "react";

/** Keep a renderer/chunk failure from discarding the scientific workspace. */
export class VisualizationBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section role="alert"><h3>{this.props.label} unavailable</h3>
      <p>The renderer could not load. The experiment data and other views remain available.</p>
      <button type="button" onClick={() => this.setState({ failed: false, attempt: this.state.attempt + 1 })}>Retry this view</button></section>;
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}
