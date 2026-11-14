"use client";
import {
  useEffect,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";

/** Page presentation only: no changes to scroll physics, request data, or calculations. */
export function useJourneyMotion(
  content: RefObject<HTMLDivElement | null>,
  progress: RefObject<HTMLDivElement | null>,
  motion: boolean,
  onChapter: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    let frame: number | null = null;
    const paint = () => {
      frame = null;
      const max = Math.max(
          1,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
        ratio = Math.max(0, Math.min(1, window.scrollY / max));
      if (progress.current)
        progress.current.style.transform = `scaleX(${ratio})`;
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(paint);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const size =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    if (content.current) size?.observe(content.current);
    paint();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      size?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [content, progress]);
  useEffect(() => {
    const root = content.current;
    if (!root) return;
    const sections = new Map<string, HTMLElement>();
    let viewbar: Element | null = null;
    const visibleView = () => {
      const tab = root.querySelector(
        '.workspace-viewbar [aria-selected="true"]',
      );
      return tab?.id === "tab-structure"
        ? "structure"
        : tab?.id === "tab-evidence"
          ? "paper-evidence"
          : "experiment";
    };
    const mark = (id: string) => {
      onChapter(id);
      for (const a of root.querySelectorAll<HTMLAnchorElement>(
        '.workspace-rail a[href^="#"], .workspace-header a[href^="#"]',
      )) {
        if (a.hash === "#" + id) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      }
    };
    const chapter =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries)
                if (entry.isIntersecting) {
                  mark(
                    entry.target.id === "start"
                      ? ""
                      : entry.target.id === "experiment"
                        ? visibleView()
                        : entry.target.id,
                  );
                }
            },
            { rootMargin: "-12% 0px -58% 0px", threshold: 0 },
          )
        : null;
    // Watch only the tab bar, rather than Plotly's frequently changing descendants.
    const views =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => mark(visibleView()))
        : null;
    const scan = () => {
      for (const id of ["start", "research", "experiment"]) {
        const el = root.querySelector<HTMLElement>("#" + id),
          old = sections.get(id);
        if (el !== old) {
          if (old) chapter?.unobserve(old);
          if (el) {
            sections.set(id, el);
            chapter?.observe(el);
          } else sections.delete(id);
        }
      }
      const next = root.querySelector(".workspace-viewbar");
      if (next !== viewbar) {
        views?.disconnect();
        viewbar = next;
        if (next)
          views?.observe(next, {
            attributes: true,
            subtree: true,
            attributeFilter: ["aria-selected"],
          });
      }
    };
    scan();
    const workspace = root.querySelector(".editorial-workspace");
    const mutations =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(scan)
        : null;
    if (workspace) mutations?.observe(workspace, { childList: true });
    const hash = () => {
      const id = window.location.hash.slice(1);
      if (
        ["research", "experiment", "structure", "paper-evidence"].includes(id)
      )
        mark(id);
      else if (id === "start") mark("");
    };
    window.addEventListener("hashchange", hash);
    return () => {
      chapter?.disconnect();
      views?.disconnect();
      mutations?.disconnect();
      window.removeEventListener("hashchange", hash);
    };
  }, [content, onChapter]);
  useEffect(() => {
    const root = content.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>("[data-journey-reveal]"),
    );
    if (!motion || typeof IntersectionObserver === "undefined") {
      items.forEach((el) => el.classList.remove("journey-before-view"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.remove("journey-before-view");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.05, rootMargin: "0px 0px -16px 0px" },
    );
    for (const el of items)
      if (el.getBoundingClientRect().top > window.innerHeight * 0.95) {
        el.classList.add("journey-before-view");
        observer.observe(el);
      }
    const focus = (event: FocusEvent) => {
      for (const el of items)
        if (el.contains(event.target as Node))
          el.classList.remove("journey-before-view");
    };
    root.addEventListener("focusin", focus);
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", focus);
      items.forEach((el) => el.classList.remove("journey-before-view"));
    };
  }, [content, motion]);
}
