/** Continuous, time-based presentation motion; independent of pointer event frequency. */
export function initialReveal(x = 0, y = 0) {
  return { x, y, vx: 0, vy: 0, r: 0, opacity: 0 };
}
function spring(position, velocity, target, seconds) {
  const frequency = 18,
    decay = Math.exp(-frequency * seconds),
    offset = position - target,
    travel = (velocity + frequency * offset) * seconds;
  return [
    target + (offset + travel) * decay,
    (velocity - frequency * travel) * decay,
  ];
}
export function advanceReveal(state, target, milliseconds) {
  const seconds = Math.max(0, milliseconds) / 1000;
  const [x, vx] = spring(state.x, state.vx, target.x, seconds),
    [y, vy] = spring(state.y, state.vy, target.y, seconds);
  const radiusEase =
    1 - Math.exp(-seconds / (target.r > state.r ? 0.24 : 0.18));
  const opacityEase =
    1 - Math.exp(-seconds / (target.opacity > state.opacity ? 0.16 : 0.2));
  return {
    x,
    y,
    vx,
    vy,
    r: Math.max(0, state.r + (target.r - state.r) * radiusEase),
    opacity: Math.max(
      0,
      Math.min(
        1,
        state.opacity + (target.opacity - state.opacity) * opacityEase,
      ),
    ),
  };
}
export function revealSettled(state, target) {
  return (
    Math.abs(state.x - target.x) + Math.abs(state.y - target.y) < 0.1 &&
    Math.abs(state.vx) + Math.abs(state.vy) < 0.5 &&
    Math.abs(state.r - target.r) < 0.1 &&
    Math.abs(state.opacity - target.opacity) < 0.001
  );
}
