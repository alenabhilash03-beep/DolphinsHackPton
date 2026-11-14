"use client";
import { useEffect, useId, useRef, useState } from "react";
import { workspaceChapters } from "./WorkspaceExplorer";
import {
  navigateWithinWorkspace,
  workspaceDestinationExists,
} from "../lib/journey-navigation";

export function ResearchMenu({
  onClose,
  current,
}: {
  onClose: () => void;
  current: string;
}) {
  const dialog = useRef<HTMLDivElement>(null),
    id = useId(),
    [preview, setPreview] = useState(0);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null,
      bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = dialog.current;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>("a[href],button:not(:disabled)") ||
          [],
      );
    focusables()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const list = focusables(),
        first = list[0],
        last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = bodyOverflow;
      if (prior?.isConnected) prior.focus({ preventScroll: true });
    };
  }, [onClose]);
  function choose(event: React.MouseEvent<HTMLAnchorElement>, target: string) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    const exists = workspaceDestinationExists(target);
    onClose();
    if (exists) {
      event.preventDefault();
      requestAnimationFrame(() => navigateWithinWorkspace(target));
    }
  }
  const selected = workspaceChapters[preview];
  return (
    <div
      className="research-menu"
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
    >
      <div className="research-menu-top">
        <a
          href="/#start"
          onClick={(e) => choose(e, "start")}
          className="research-menu-brand"
        >
          hypothesim<span>.</span>
        </a>
        <button className="research-menu-close" type="button" onClick={onClose}>
          Close <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="research-menu-body">
        <div className="research-menu-preview" aria-hidden="true">
          <span className="menu-preview-number" key={selected.id}>
            {selected.symbol}
          </span>
          <div>
            <span>Workspace section</span>
            <h2>{selected.name}</h2>
            <p>{selected.copy}</p>
          </div>
          <div className="menu-preview-rule" />
          <span>PK / PD &amp; antibody binding</span>
        </div>
        <nav aria-label="Research navigation">
          <h2 id={id}>Workspace index</h2>
          {workspaceChapters.map((c, i) => (
            <a
              key={c.id}
              href={"/#" + c.id}
              aria-current={current === c.id ? "location" : undefined}
              onPointerEnter={() => setPreview(i)}
              onFocus={() => setPreview(i)}
              onClick={(e) => choose(e, c.id)}
            >
              <span>{c.symbol}</span>
              <span>{c.name}</span>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
          <a
            className="menu-start-link"
            href="/#start"
            onClick={(e) => choose(e, "start")}
          >
            Start page <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </div>
      <footer>
        <span>Scientific workspace</span>
        <span>Evidence and assumptions remain visible.</span>
      </footer>
    </div>
  );
}
