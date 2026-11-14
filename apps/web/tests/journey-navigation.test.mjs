import assert from "node:assert/strict";
import { test } from "node:test";
import {
  navigateWithinWorkspace,
  workspaceDestinationExists,
} from "../lib/journey-navigation.ts";

function environment(t) {
  const saved = new Map(
    ["document", "window", "HTMLDetailsElement", "requestAnimationFrame"].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
    ),
  );
  t.after(() => {
    for (const [key, descriptor] of saved)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  });
  class Details {
    open = false;
    parentElement = null;
  }
  const calls = [],
    frames = [],
    elements = new Map();
  const preference = { paused: false, reduced: false };
  globalThis.HTMLDetailsElement = Details;
  globalThis.document = {
    getElementById: (id) => elements.get(id) || null,
    querySelector: () => ({
      getAttribute: () => (preference.paused ? "paused" : "on"),
    }),
  };
  globalThis.window = {
    matchMedia: () => ({ matches: preference.reduced }),
    location: { hash: "" },
    history: {
      pushState(_state, _unused, hash) {
        globalThis.window.location.hash = hash;
      },
    },
  };
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  const target = (parent = null) => ({
    parentElement: parent,
    hasAttribute: () => false,
    setAttribute: (...args) => calls.push(["attribute", ...args]),
    focus: (options) => calls.push(["focus", options]),
    scrollIntoView: (options) => calls.push(["scroll", options]),
    querySelector: () => null,
  });
  return { Details, calls, frames, elements, preference, target };
}

test("an unavailable workspace destination leaves the page unchanged", (t) => {
  const env = environment(t);
  assert.equal(workspaceDestinationExists("missing"), false);
  assert.equal(navigateWithinWorkspace("missing"), false);
  assert.equal(env.calls.length, 0);
  assert.equal(env.frames.length, 0);
});

test("section navigation reveals closed details, focuses the destination, and honors motion preferences", (t) => {
  const env = environment(t),
    parent = new env.Details(),
    target = env.target(parent),
    editor = new env.Details();
  target.querySelector = () => editor;
  env.elements.set("research", target);
  assert.equal(navigateWithinWorkspace("research"), true);
  assert.equal(parent.open, true);
  assert.equal(editor.open, true);
  assert.equal(window.location.hash, "#research");
  assert.deepEqual(env.calls[0], [
    "scroll",
    { behavior: "smooth", block: "start" },
  ]);
  assert.deepEqual(env.calls.at(-1), ["focus", { preventScroll: true }]);
  env.preference.paused = true;
  env.calls.length = 0;
  navigateWithinWorkspace("research");
  assert.equal(env.calls[0][1].behavior, "auto");
  env.preference.paused = false;
  env.preference.reduced = true;
  env.calls.length = 0;
  navigateWithinWorkspace("research");
  assert.equal(env.calls[0][1].behavior, "auto");
});

test("a molecular destination selects its tab and waits for the lazy panel before focusing", (t) => {
  const env = environment(t),
    target = env.target();
  let selected = false;
  env.elements.set("tab-structure", {
    click() {
      selected = true;
    },
  });
  assert.equal(workspaceDestinationExists("structure"), true);
  assert.equal(navigateWithinWorkspace("structure"), true);
  assert.equal(selected, true);
  assert.equal(env.calls.length, 0);
  env.elements.set("structure", target);
  env.frames.shift()();
  assert.deepEqual(env.calls.at(-1), ["focus", { preventScroll: true }]);
});
