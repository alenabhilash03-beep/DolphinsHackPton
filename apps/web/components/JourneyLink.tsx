"use client";
import { navigateWithinWorkspace } from "../lib/journey-navigation";
export function JourneyLink({
  target,
  children,
  secondary = false,
}: {
  target: string;
  children: string;
  secondary?: boolean;
}) {
  return (
    <a
      className={`journey-link${secondary ? " journey-link-secondary" : ""}`}
      href={"#" + target}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
          return;
        if (navigateWithinWorkspace(target)) e.preventDefault();
      }}
    >
      <span className="journey-link-label">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
      <span className="journey-link-arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}
