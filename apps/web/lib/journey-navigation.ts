const destinationTabs: Record<string, string> = {
  experiment: "tab-simulation",
  "paper-evidence": "tab-evidence",
  structure: "tab-structure",
  "model-details": "tab-details",
};

export function workspaceDestinationExists(id: string): boolean {
  const tabId = destinationTabs[id];
  return !!(
    document.getElementById(id) ||
    (tabId && document.getElementById(tabId))
  );
}

/** Reveal a destination without changing any research request or model inputs. */
export function navigateWithinWorkspace(id: string): boolean {
  if (!workspaceDestinationExists(id)) return false;
  if (window.location.hash !== "#" + id) {
    window.history.pushState(null, "", "#" + id);
  }
  const tabId = destinationTabs[id];
  const tab = tabId ? document.getElementById(tabId) : null;

  function reveal() {
    const target = document.getElementById(id);
    if (!target) return;
    for (
      let parent: HTMLElement | null = target;
      parent;
      parent = parent.parentElement
    ) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    if (id === "research") {
      const editor = target.querySelector<HTMLDetailsElement>(
        ".question-disclosure",
      );
      if (editor) editor.open = true;
    }
    const paused =
      document
        .querySelector(".glass-environment")
        ?.getAttribute("data-motion") === "paused";
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: paused || reduced ? "auto" : "smooth",
      block: "start",
    });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }

  // The molecular panel is mounted on its first visit. Wait for React to reveal
  // the selected view before measuring, scrolling, or moving keyboard focus.
  if (tab) {
    tab.click();
    requestAnimationFrame(reveal);
  } else {
    reveal();
  }
  return true;
}
