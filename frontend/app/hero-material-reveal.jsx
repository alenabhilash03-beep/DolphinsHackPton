"use client";
import { useEffect, useRef } from "react";
import {
  advanceReveal,
  initialReveal,
  revealSettled,
} from "./hero-reveal-motion.mjs";

/** One animation clock owns following, feathering, and fading. */
export default function HeroMaterialReveal({ motion = true }) {
  const root = useRef(null),
    reveal = useRef(null);
  useEffect(() => {
    const element = root.current,
      layer = reveal.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)"),
      fine = matchMedia("(hover: hover) and (pointer: fine)");
    const supportsMask =
      typeof window.CSS?.supports === "function" &&
      (window.CSS.supports(
        "mask-image",
        "radial-gradient(black, transparent)",
      ) ||
        window.CSS.supports(
          "-webkit-mask-image",
          "radial-gradient(black, transparent)",
        ));
    let frame = null,
      enabled = false,
      bounds = null,
      lastTime = null,
      state = initialReveal(),
      target = { x: 0, y: 0, r: 0, opacity: 0 };
    const write = () => {
      layer.style.setProperty("--reveal-x", state.x.toFixed(2) + "px");
      layer.style.setProperty("--reveal-y", state.y.toFixed(2) + "px");
      layer.style.setProperty("--reveal-r", state.r.toFixed(2) + "px");
      layer.style.setProperty(
        "--reveal-opacity",
        (state.opacity * 0.68).toFixed(4),
      );
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
    };
    const paint = (time) => {
      frame = null;
      const elapsed = lastTime === null ? 16 : Math.max(0, time - lastTime);
      lastTime = time;
      state = advanceReveal(state, target, elapsed);
      if (revealSettled(state, target)) {
        state = {
          ...state,
          x: target.x,
          y: target.y,
          vx: 0,
          vy: 0,
          r: target.r,
          opacity: target.opacity,
        };
        lastTime = null;
      } else frame = requestAnimationFrame(paint);
      write();
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(paint);
    };
    const fade = () => {
      if (target.opacity === 0) return;
      target = { x: state.x, y: state.y, r: 0, opacity: 0 };
      layer.dataset.visible = "false";
      schedule();
    };
    const reset = () => {
      stop();
      state = initialReveal(state.x, state.y);
      target = { x: state.x, y: state.y, r: 0, opacity: 0 };
      layer.dataset.visible = "false";
      write();
    };
    const move = (event) => {
      if (!enabled) return;
      if (event.pointerType === "touch") {
        reset();
        return;
      }
      if (event.isPrimary === false) return;
      const node = event.target instanceof window.Element ? event.target : null;
      if (
        node?.closest(
          'button,a,input,textarea,select,summary,[role="tab"],.entry-header,.entry-hero-copy,.entry-wordmark,.home-destination-preview',
        )
      ) {
        fade();
        return;
      }
      bounds = bounds || element.getBoundingClientRect();
      const x = event.clientX - bounds.left,
        y = event.clientY - bounds.top;
      if (
        !bounds.width ||
        !bounds.height ||
        x < bounds.width * 0.38 ||
        x > bounds.width ||
        y < 0 ||
        y > bounds.height
      ) {
        fade();
        return;
      }
      // A quick return continues the current radius and opacity rather than restarting.
      if (state.opacity < 0.001 && state.r < 0.1) {
        state = initialReveal(x, y);
      }
      target = {
        x,
        y,
        r: Math.max(110, Math.min(200, bounds.width * 0.14)),
        opacity: 1,
      };
      layer.dataset.visible = "true";
      schedule();
    };
    const invalidate = () => {
      bounds = null;
      reset();
    };
    const leave = (event) => {
      if (!event.relatedTarget) fade();
    };
    const sync = () => {
      enabled =
        motion &&
        !reduced.matches &&
        fine.matches &&
        !document.hidden &&
        supportsMask;
      element.dataset.interactive = String(enabled);
      invalidate();
    };
    const size =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(invalidate)
        : null;
    size?.observe(element);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", leave);
    window.addEventListener("pointercancel", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("scroll", invalidate, { passive: true });
    window.addEventListener("resize", invalidate);
    reduced.addEventListener("change", sync);
    fine.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      stop();
      size?.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("pointercancel", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("scroll", invalidate);
      window.removeEventListener("resize", invalidate);
      reduced.removeEventListener("change", sync);
      fine.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [motion]);
  return (
    <div
      className="entry-scene-bg"
      ref={root}
      aria-hidden="true"
      data-interactive="false"
    >
      <img
        src="/images/research-sculpture.webp"
        alt=""
        width="1600"
        height="800"
        fetchPriority="high"
        decoding="async"
      />
      <div ref={reveal} className="entry-sculpture-reveal" data-visible="false">
        <img
          src="/images/research-sculpture.webp"
          alt=""
          width="1600"
          height="800"
          decoding="async"
          draggable="false"
        />
      </div>
    </div>
  );
}
