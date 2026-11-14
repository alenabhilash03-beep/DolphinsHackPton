import { GlassStudy } from "./GlassStudy";
import { JourneyLink } from "./JourneyLink";
import { WorkspaceExplorer } from "./WorkspaceExplorer";
export function ResearchEntrance() {
  return (
    <div className="research-entrance" id="start">
      <section className="entrance-stage" aria-labelledby="entrance-title">
        <div className="entrance-topline">
          <span>Scientific workspace</span>
          <span>PK / PD &amp; antibody binding</span>
        </div>
        <h1 id="entrance-title">
          Hypothesim<span>.</span>
        </h1>
        <div className="entrance-composition">
          <div className="entrance-copy">
            <p className="journey-kicker">Exposure. Binding. Evidence.</p>
            <p className="entrance-description">
              A question, its assumptions,
              <br />
              and the experiment that follows.
            </p>
            <JourneyLink target="workspace">Enter workspace</JourneyLink>
            <a className="entrance-index-link" href="#workspace-explorer">
              Browse the workspace <span aria-hidden="true">↓</span>
            </a>
          </div>
          <GlassStudy />
        </div>
        <div className="entrance-baseline">
          <span>
            One-compartment PK <i /> 1:1 binding models
          </span>
          <span>Exploratory predictions · explicit limitations</span>
        </div>
      </section>
      <WorkspaceExplorer />
      <div className="entrance-to-workspace" data-journey-reveal>
        <span>Continue to your research</span>
        <JourneyLink target="workspace" secondary>
          Enter workspace
        </JourneyLink>
      </div>
    </div>
  );
}
