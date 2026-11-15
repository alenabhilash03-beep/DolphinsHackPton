"use client";
import { useEffect, useRef } from "react";
const views = [
  { name: "Simulation", id: "simulation" },
  { name: "Model & assumptions", id: "model" },
  { name: "Linked research", id: "research" },
  { name: "Versions", id: "versions" },
];
export const experimentViewLabel = (value) =>
  "experiment-tab-" +
  (views.find((view) => view.name === value)?.id || "simulation");
export default function ExperimentViewTabs({ value, onChange, papers = 0 }) {
  const root = useRef(null),
    buttons = useRef([]);
  useEffect(() => {
    const element = root.current;
    let frame = null;
    const paint = () => {
      frame = null;
      const active =
        buttons.current[views.findIndex((view) => view.name === value)];
      if (active) {
        element.style.setProperty("--active-tab-x", active.offsetLeft + "px");
        element.style.setProperty(
          "--active-tab-width",
          active.offsetWidth + "px",
        );
      }
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(paint);
    };
    const size =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(schedule)
        : null;
    size?.observe(element);
    buttons.current.forEach((button) => button && size?.observe(button));
    paint();
    window.addEventListener("resize", schedule);
    return () => {
      size?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [value]);
  function select(index, focus = false) {
    onChange(views[index].name);
    if (focus) {
      buttons.current[index]?.focus({ preventScroll: true });
      buttons.current[index]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "auto",
      });
    }
  }
  return (
    <div
      className="experiment-tabs"
      ref={root}
      role="tablist"
      aria-label="Experiment views"
    >
      {views.map((view, index) => (
        <button
          key={view.id}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          id={"experiment-tab-" + view.id}
          type="button"
          role="tab"
          aria-controls="experiment-view-panel"
          aria-selected={value === view.name}
          tabIndex={value === view.name ? 0 : -1}
          className={value === view.name ? "active" : ""}
          onClick={() => select(index)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            select(
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? views.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      views.length) %
                    views.length,
              true,
            );
          }}
        >
          {view.name}
          {view.name === "Linked research" && <span>{papers}</span>}
        </button>
      ))}
      <span className="calculation-label" aria-hidden="true">
        <i />
        Live calculations
      </span>
      <i className="experiment-tab-ink" aria-hidden="true" />
    </div>
  );
}
