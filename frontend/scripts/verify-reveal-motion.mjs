import assert from "node:assert/strict";
import {
  advanceReveal,
  initialReveal,
  revealSettled,
} from "../app/hero-reveal-motion.mjs";
const goal = { x: 680, y: 300, r: 160, opacity: 1 };
function run(hz, seconds) {
  let state = initialReveal(500, 200);
  for (let i = 0; i < hz * seconds; i++)
    state = advanceReveal(state, goal, 1000 / hz);
  return state;
}
const at30 = run(30, 1),
  at60 = run(60, 1),
  at120 = run(120, 1);
for (const key of ["x", "y", "vx", "vy", "r", "opacity"]) {
  assert.ok(Math.abs(at30[key] - at60[key]) < 1e-8, key);
  assert.ok(Math.abs(at60[key] - at120[key]) < 1e-8, key);
}
let state = run(60, 1),
  leaving = { x: state.x, y: state.y, r: 0, opacity: 0 };
state = advanceReveal(state, leaving, 80);
const before = { ...state };
state = advanceReveal(state, { ...goal, x: 700 }, 16);
assert.ok(state.r > before.r, "Returning during the fade continues the radius");
assert.ok(state.r > 100, "The radius never resets to zero on a quick return");
assert.ok(
  Math.abs(state.x - before.x) < 10,
  "Returning does not teleport the mask",
);
const hidden = { x: state.x, y: state.y, r: 0, opacity: 0 };
for (let i = 0; i < 240; i++) state = advanceReveal(state, hidden, 1000 / 60);
assert.ok(revealSettled(state, hidden));
assert.ok(state.r >= 0 && state.opacity >= 0 && state.opacity <= 1);
console.log(
  "Passed: consistent motion at 30/60/120 Hz, continuous leave/re-entry, bounded alpha/radius, and settled fade-out.",
);
