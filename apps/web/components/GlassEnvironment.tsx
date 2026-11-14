"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ResearchMenu } from "./ResearchMenu";
import { workspaceChapters } from "./WorkspaceExplorer";
import { useJourneyMotion } from "../hooks/useJourneyMotion";
import GlassBackground from "./GlassBackground";

export function GlassEnvironment({ children }: { children: ReactNode }) {
  const [motion, setMotion] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [menu, setMenu] = useState(false),
    [chapter, setChapter] = useState("");
  const content = useRef<HTMLDivElement>(null),
    progress = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  useJourneyMotion(content, progress, motion && !reduced, setChapter);
  const selectedChapter = workspaceChapters.find((item) => item.id === chapter);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    try {
      setMotion(localStorage.getItem("hypothesim-entry-motion") !== "off");
    } catch {
      setMotion(true);
    }
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function toggleMotion() {
    const next = !motion;
    setMotion(next);
    try {
      localStorage.setItem("hypothesim-entry-motion", next ? "on" : "off");
    } catch {
      /* A blocked preference store must not interrupt workspace use. */
    }
  }

  return (
    <div
      className="glass-environment"
      data-motion={motion && !reduced ? "on" : "paused"}
    >
      <GlassBackground motion={motion && !reduced} />
      <div className="glass-content">
        <div className="glass-preferences journey-toolbar" inert={menu}>
          <a className="journey-wordmark" href="/">
            hypothesim<span>.</span>
          </a>
          <span className="journey-current-section">
            {selectedChapter
              ? selectedChapter.symbol + " / " + selectedChapter.name
              : "Scientific workspace"}
          </span>
          <div className="journey-toolbar-actions">
            <button
              type="button"
              onClick={toggleMotion}
              disabled={reduced}
              aria-pressed={!motion || reduced}
              aria-label={
                reduced
                  ? "Background motion follows reduced-motion setting"
                  : motion
                    ? "Pause background motion"
                    : "Enable background motion"
              }
            >
              {reduced ? "Motion reduced" : motion ? "Motion on" : "Motion off"}
            </button>
            <button
              type="button"
              className="journey-menu-trigger"
              aria-haspopup="dialog"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              Menu{" "}
              <span aria-hidden="true">
                <i />
                <i />
              </span>
            </button>
          </div>
          <div
            ref={progress}
            className="journey-scroll-progress"
            aria-hidden="true"
          />
        </div>
        <div ref={content} className="journey-page-content" inert={menu}>
          {children}
        </div>
        {menu && <ResearchMenu onClose={closeMenu} current={chapter} />}
      </div>
    </div>
  );
}
