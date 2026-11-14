"use client";
import { useState } from "react";
import { JourneyLink } from "./JourneyLink";
export const workspaceChapters = [
  {
    id: "research",
    name: "Research",
    detail: "Question, sources, and model scope",
    copy: "Submit a drug–target question. Review the evidence, supply missing inputs, and keep assumptions visible.",
    action: "Open research",
    symbol: "01",
  },
  {
    id: "experiment",
    name: "Simulation",
    detail: "Exposure and target engagement",
    copy: "Adjust the conditions of an alternative and compare the resulting concentration and occupancy curves.",
    action: "Open simulation",
    symbol: "02",
  },
  {
    id: "paper-evidence",
    name: "Evidence",
    detail: "Papers, citations, and model inputs",
    copy: "Read the supporting papers and inspect which measurements or assumptions underlie the displayed experiment.",
    action: "Open evidence",
    symbol: "03",
  },
  {
    id: "structure",
    name: "Structure",
    detail: "Deposited molecular geometry",
    copy: "Inspect a verified cached structure when one is available. Structure views and model predictions retain their separate scientific roles.",
    action: "Open structure",
    symbol: "04",
  },
] as const;
export function WorkspaceExplorer() {
  const [index, setIndex] = useState(0),
    chapter = workspaceChapters[index];
  function select(next: number, focus = false) {
    const i = (next + workspaceChapters.length) % workspaceChapters.length;
    setIndex(i);
    if (focus)
      document
        .getElementById("chapter-tab-" + workspaceChapters[i].id)
        ?.focus();
  }
  return (
    <section
      id="workspace-explorer"
      className="workspace-explorer"
      aria-labelledby="explorer-title"
      data-journey-reveal
    >
      <div className="explorer-heading">
        <div>
          <p className="journey-kicker">Workspace index</p>
          <h2 id="explorer-title">Explore the workspace.</h2>
        </div>
        <div className="explorer-paging">
          <button
            type="button"
            aria-label="Previous workspace section"
            onClick={() => select(index - 1)}
          >
            ←
          </button>
          <span aria-live="polite">
            0{index + 1} / 0{workspaceChapters.length}
          </span>
          <button
            type="button"
            aria-label="Next workspace section"
            onClick={() => select(index + 1)}
          >
            →
          </button>
        </div>
      </div>
      <div
        className="explorer-tabs"
        role="tablist"
        aria-label="Workspace sections"
      >
        {workspaceChapters.map((c, i) => (
          <button
            key={c.id}
            id={"chapter-tab-" + c.id}
            role="tab"
            aria-selected={i === index}
            aria-controls={"chapter-panel-" + c.id}
            tabIndex={i === index ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              select(
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? workspaceChapters.length - 1
                    : index + (e.key === "ArrowRight" ? 1 : -1),
                true,
              );
            }}
          >
            <span>{c.symbol}</span>
            {c.name}
            <span aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
      <div
        className="explorer-panel"
        role="tabpanel"
        id={"chapter-panel-" + chapter.id}
        aria-labelledby={"chapter-tab-" + chapter.id}
        tabIndex={0}
      >
        <div className="explorer-description" key={chapter.id}>
          <p className="journey-kicker">{chapter.detail}</p>
          <h3>{chapter.name}</h3>
          <p>{chapter.copy}</p>
          <JourneyLink target={chapter.id}>{chapter.action}</JourneyLink>
        </div>
        <div
          className={"explorer-art explorer-art-" + chapter.id}
          aria-hidden="true"
        >
          <svg viewBox="0 0 600 340" focusable="false">
            {chapter.id === "research" ? (
              <g transform="translate(120 30)">
                <rect
                  x="56"
                  y="30"
                  width="260"
                  height="240"
                  rx="24"
                  fill="#AC9C8D"
                  opacity=".25"
                  transform="rotate(12 186 150)"
                />
                <rect
                  x="20"
                  y="20"
                  width="260"
                  height="240"
                  rx="24"
                  fill="#EFE9E1"
                  stroke="#AC9C8D"
                  strokeOpacity=".6"
                  transform="rotate(-8 150 140)"
                />
                <path
                  d="M75 85H220M75 112H190M75 174H215M75 198H174"
                  stroke="#72383D"
                  strokeWidth="2"
                  opacity=".5"
                />
                <circle cx="235" cy="230" r="34" fill="#72383D" />
                <path
                  d="m222 230 9 9 18-19"
                  fill="none"
                  stroke="#EFE9E1"
                  strokeWidth="2"
                />
              </g>
            ) : chapter.id === "experiment" ? (
              <g fill="none" strokeWidth="2">
                <path
                  d="M70 260H530M70 80V260"
                  stroke="#AC9C8D"
                  strokeOpacity=".5"
                />
                <path
                  d="M70 105C220 108 245 233 530 238"
                  stroke="#65594F"
                  strokeDasharray="5 6"
                />
                <path d="M70 105C260 110 320 138 530 192" stroke="#72383D" />
                <path
                  d="M70 105C200 108 350 159 530 170"
                  stroke="#AC9C8D"
                  strokeDasharray="2 6"
                />
                <circle
                  cx="345"
                  cy="151"
                  r="8"
                  fill="#72383D"
                  stroke="#EFE9E1"
                />
                <path
                  d="M345 75V260"
                  stroke="#72383D"
                  strokeWidth="1"
                  strokeOpacity=".4"
                />
              </g>
            ) : chapter.id === "paper-evidence" ? (
              <g transform="translate(110 50)">
                <rect
                  x="0"
                  y="0"
                  width="380"
                  height="240"
                  rx="24"
                  fill="#EFE9E1"
                  stroke="#AC9C8D"
                />
                <path
                  d="M28 60H352M28 120H352M28 180H352M110 24V216"
                  fill="none"
                  stroke="#AC9C8D"
                  strokeOpacity=".5"
                />
                {[90, 150, 210].map((y, i) => (
                  <g key={y}>
                    <circle
                      cx="65"
                      cy={y - 3}
                      r="12"
                      fill="none"
                      stroke="#72383D"
                    />
                    <path
                      d={`M140 ${y - 8}H${310 - i * 25}M140 ${y + 6}H${270 - i * 25}`}
                      stroke="#72383D"
                      strokeOpacity=".5"
                    />
                  </g>
                ))}
              </g>
            ) : (
              <g fill="none" stroke="#72383D">
                {[0, 60, 120].map((n) => (
                  <ellipse
                    key={n}
                    cx="300"
                    cy="170"
                    rx="150"
                    ry="55"
                    strokeOpacity=".4"
                    transform={`rotate(${n} 300 170)`}
                  />
                ))}
                <circle cx="300" cy="170" r="23" fill="#72383D" />
                <circle cx="450" cy="170" r="9" fill="#AC9C8D" stroke="none" />
                <circle cx="225" cy="40" r="9" fill="#AC9C8D" stroke="none" />
                <circle cx="225" cy="300" r="9" fill="#AC9C8D" stroke="none" />
              </g>
            )}
          </svg>
          <span>Illustrative section preview</span>
        </div>
      </div>
    </section>
  );
}
