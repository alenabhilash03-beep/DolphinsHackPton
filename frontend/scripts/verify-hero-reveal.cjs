const assert = require("node:assert/strict"),
  { readFileSync } = require("node:fs"),
  { JSDOM } = require("jsdom"),
  swc = require("next/dist/build/swc");
const dom = new JSDOM(
  '<!doctype html><div id="root"></div><div class="entry-hero-copy"><span id="copy">Research question</span><button id="control">Enter workspace</button></div>',
  { url: "https://test.example/", pretendToBeVisual: true },
);
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(global, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
let maskSupported = true;
Object.defineProperty(window, "CSS", {
  configurable: true,
  value: { supports: () => maskSupported },
});
let hidden = false;
Object.defineProperty(document, "hidden", {
  configurable: true,
  get: () => hidden,
});
const media = (value) => ({
    matches: value,
    listeners: new Set(),
    addEventListener(_, f) {
      this.listeners.add(f);
    },
    removeEventListener(_, f) {
      this.listeners.delete(f);
    },
    change(value) {
      this.matches = value;
      for (const f of this.listeners) f({ matches: value });
    },
  }),
  reduced = media(false),
  fine = media(true);
global.matchMedia = (q) => (q.includes("reduced-motion") ? reduced : fine);
let next = 0,
  clock = 0;
const frames = new Map();
global.requestAnimationFrame = (f) => {
  frames.set(++next, f);
  return next;
};
global.cancelAnimationFrame = (id) => frames.delete(id);
const tick = () => {
  clock += 16;
  for (const [id, f] of [...frames]) {
    frames.delete(id);
    f(clock);
  }
};
const settle = () => {
  let count = 0;
  while (frames.size && count++ < 180) tick();
  assert.equal(frames.size, 0, "Reveal stops repainting after it settles");
};
const observers = [];
global.ResizeObserver = class {
  constructor(callback) {
    this.callback = callback;
    observers.push(this);
  }
  observe() {}
  disconnect() {
    this.disconnected = true;
  }
};
HTMLElement.prototype.getBoundingClientRect = () => ({
  left: 20,
  top: 30,
  width: 1000,
  height: 600,
  right: 1020,
  bottom: 630,
});
const pointer = (x, y, type = "mouse", target = document.body) => {
  const e = new window.MouseEvent("pointermove", {
    bubbles: true,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(e, "pointerType", { value: type });
  target.dispatchEvent(e);
};
async function main() {
  await swc.loadBindings();
  require.extensions[".jsx"] = (m, file) =>
    m._compile(
      swc.transformSync(readFileSync(file, "utf8"), {
        filename: file,
        jsc: {
          target: "es2022",
          parser: { syntax: "ecmascript", jsx: true },
          transform: { react: { runtime: "automatic" } },
        },
        module: { type: "commonjs" },
      }).code,
      file,
    );
  const React = require("react"),
    { act } = React,
    { createRoot } = require("react-dom/client"),
    Reveal = require("../app/hero-material-reveal.jsx").default,
    root = createRoot(document.getElementById("root"));
  await act(async () =>
    root.render(React.createElement(Reveal, { motion: true })),
  );
  const scene = document.querySelector(".entry-scene-bg"),
    layer = document.querySelector(".entry-sculpture-reveal");
  assert.equal(scene.getAttribute("aria-hidden"), "true");
  assert.equal(scene.dataset.interactive, "true");
  assert.equal(layer.dataset.visible, "false");
  assert.equal(frames.size, 0, "Nothing animates before a pointer interaction");
  pointer(780, 330);
  pointer(820, 350);
  assert.equal(frames.size, 1, "Pointer events share one pending paint");
  tick();
  assert.equal(layer.dataset.visible, "true");
  assert.ok(parseFloat(layer.style.getPropertyValue("--reveal-r")) > 0);
  assert.ok(
    parseFloat(layer.style.getPropertyValue("--reveal-r")) < 140,
    "The material reveals gradually",
  );
  settle();
  assert.ok(
    Math.abs(parseFloat(layer.style.getPropertyValue("--reveal-x")) - 800) <
      0.25,
  );
  assert.ok(parseFloat(layer.style.getPropertyValue("--reveal-r")) <= 140);
  const opacityBefore = parseFloat(
    layer.style.getPropertyValue("--reveal-opacity"),
  );
  pointer(820, 350, "mouse", document.getElementById("copy"));
  assert.equal(layer.dataset.visible, "false", "Reading copy is excluded");
  assert.equal(
    parseFloat(layer.style.getPropertyValue("--reveal-opacity")),
    opacityBefore,
    "Leaving starts from the current opacity",
  );
  tick();
  const fadingRadius = parseFloat(layer.style.getPropertyValue("--reveal-r"));
  assert.ok(fadingRadius > 0, "The reveal fades instead of resetting its mask");
  pointer(820, 350);
  tick();
  assert.ok(
    parseFloat(layer.style.getPropertyValue("--reveal-r")) > fadingRadius,
    "Quick re-entry continues the previous reveal",
  );
  settle();
  pointer(820, 350, "mouse", document.getElementById("control"));
  assert.equal(layer.dataset.visible, "false", "Controls are excluded");
  settle();
  assert.equal(layer.style.getPropertyValue("--reveal-opacity"), "0.0000");
  pointer(100, 350);
  assert.equal(frames.size, 0, "The left text column stays quiet");
  pointer(1800, 350);
  assert.equal(frames.size, 0, "Outside the artwork stays quiet");
  pointer(820, 350, "touch");
  assert.equal(frames.size, 0, "Touch never starts the reveal");
  pointer(820, 350);
  window.dispatchEvent(new window.Event("scroll"));
  assert.equal(layer.dataset.visible, "false");
  assert.equal(frames.size, 0);
  pointer(820, 350);
  window.dispatchEvent(new window.Event("blur"));
  assert.equal(layer.dataset.visible, "false");
  assert.equal(frames.size, 0);
  pointer(820, 350);
  reduced.change(true);
  assert.equal(scene.dataset.interactive, "false");
  assert.equal(frames.size, 0);
  pointer(820, 350);
  assert.equal(frames.size, 0);
  reduced.change(false);
  fine.change(false);
  assert.equal(scene.dataset.interactive, "false");
  fine.change(true);
  hidden = true;
  document.dispatchEvent(new window.Event("visibilitychange"));
  assert.equal(scene.dataset.interactive, "false");
  hidden = false;
  document.dispatchEvent(new window.Event("visibilitychange"));
  assert.equal(scene.dataset.interactive, "true");
  maskSupported = false;
  await act(async () =>
    root.render(React.createElement(Reveal, { motion: false })),
  );
  await act(async () =>
    root.render(React.createElement(Reveal, { motion: true })),
  );
  assert.equal(
    scene.dataset.interactive,
    "false",
    "A browser without mask support keeps the static artwork",
  );
  maskSupported = true;
  await act(async () =>
    root.render(React.createElement(Reveal, { motion: false })),
  );
  await act(async () =>
    root.render(React.createElement(Reveal, { motion: true })),
  );
  pointer(820, 350);
  await act(async () =>
    root.render(React.createElement(Reveal, { motion: false })),
  );
  assert.equal(frames.size, 0);
  assert.equal(scene.dataset.interactive, "false");
  pointer(820, 350);
  assert.equal(frames.size, 0);
  await act(async () =>
    root.render(React.createElement(Reveal, { motion: true })),
  );
  pointer(820, 350);
  assert.equal(frames.size, 1);
  await act(async () => root.unmount());
  assert.equal(frames.size, 0);
  assert.ok(observers.every((o) => o.disconnected));
  assert.equal(reduced.listeners.size, 0);
  assert.equal(fine.listeners.size, 0);
  pointer(820, 350);
  assert.equal(frames.size, 0);
  console.log(
    "Passed: artwork-only progressive reveal, text/control exclusion, coalesced and settling frames, motion pause, touch/coarse exclusion, reduced motion, visibility/scroll reset, and cleanup.",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
