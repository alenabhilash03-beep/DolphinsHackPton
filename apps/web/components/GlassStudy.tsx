"use client";
import { useId, useRef, useState } from "react";

export function GlassStudy() {
  const id = useId().replace(/:/g, ""),
    plane = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(
      null,
    ),
    angle = useRef({ x: -9, y: -18 }),
    [dragging, setDragging] = useState(false);
  function paint(x: number, y: number) {
    angle.current = {
      x: Math.max(-25, Math.min(25, x)),
      y: Math.max(-55, Math.min(55, y)),
    };
    plane.current?.style.setProperty("--study-x", angle.current.x + "deg");
    plane.current?.style.setProperty("--study-y", angle.current.y + "deg");
  }
  const reduced = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document
      .querySelector(".glass-environment")
      ?.getAttribute("data-motion") === "paused";
  function finish() {
    drag.current = null;
    setDragging(false);
  }
  return (
    <figure className="glass-study">
      <div
        className="glass-study-touch"
        role="group"
        tabIndex={0}
        aria-label="Rotate decorative glass study"
        aria-describedby={"study-help-" + id}
        data-dragging={dragging}
        onPointerDown={(e) => {
          if (e.pointerType === "touch" || e.button !== 0 || reduced()) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            rx: angle.current.x,
            ry: angle.current.y,
          };
          setDragging(true);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || reduced()) return;
          paint(
            d.rx - (e.clientY - d.y) * 0.12,
            d.ry + (e.clientX - d.x) * 0.18,
          );
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onBlur={finish}
        onKeyDown={(e) => {
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
            ].includes(e.key)
          )
            return;
          e.preventDefault();
          if (reduced()) return;
          if (e.key === "Home") paint(-9, -18);
          else
            paint(
              angle.current.x +
                (e.key === "ArrowUp" ? -4 : e.key === "ArrowDown" ? 4 : 0),
              angle.current.y +
                (e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0),
            );
        }}
      >
        <div className="study-orbit" aria-hidden="true" />
        <div className="study-plane" ref={plane} aria-hidden="true">
          <svg viewBox="0 0 720 640" focusable="false">
            <defs>
              <linearGradient id={"wine-" + id} x1="0" y1="0" x2="1" y2=".9">
                <stop stopColor="#D1C7BD" stopOpacity=".8" />
                <stop offset=".25" stopColor="#72383D" stopOpacity=".9" />
                <stop offset=".55" stopColor="#AC9C8D" stopOpacity=".28" />
                <stop offset=".8" stopColor="#72383D" stopOpacity=".75" />
                <stop offset="1" stopColor="#EFE9E1" stopOpacity=".9" />
              </linearGradient>
              <linearGradient id={"stone-" + id} x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#EFE9E1" />
                <stop offset=".35" stopColor="#AC9C8D" stopOpacity=".55" />
                <stop offset=".65" stopColor="#322D29" stopOpacity=".8" />
                <stop offset="1" stopColor="#D1C7BD" />
              </linearGradient>
              <linearGradient id={"edge-" + id} x1="0" y1="0" x2="1" y2="1">
                <stop stopColor="#FFFFFF" stopOpacity=".85" />
                <stop offset=".45" stopColor="#EFE9E1" stopOpacity=".12" />
                <stop offset="1" stopColor="#EFE9E1" stopOpacity=".8" />
              </linearGradient>
            </defs>
            <ellipse
              cx="355"
              cy="570"
              rx="195"
              ry="15"
              fill="#322D29"
              opacity=".035"
            />
            <g transform="rotate(-32 360 320)">
              <path
                d="M360 95C490 95 570 200 570 320S490 545 360 545 150 440 150 320 230 95 360 95ZM360 155C270 155 210 235 210 320S270 485 360 485 510 405 510 320 450 155 360 155Z"
                fill={"url(#wine-" + id + ")"}
                fillRule="evenodd"
              />
              <ellipse
                cx="360"
                cy="320"
                rx="210"
                ry="225"
                fill="none"
                stroke={"url(#edge-" + id + ")"}
                strokeWidth="1.5"
              />
              <ellipse
                cx="360"
                cy="320"
                rx="150"
                ry="165"
                fill="none"
                stroke="#EFE9E1"
                strokeOpacity=".4"
                strokeWidth="1"
              />
              {Array.from({ length: 14 }, (_, i) => (
                <ellipse
                  key={i}
                  cx="360"
                  cy="320"
                  rx={156 + i * 3.6}
                  ry={171 + i * 3.6}
                  fill="none"
                  stroke="#EFE9E1"
                  strokeOpacity={0.045 + i * 0.003}
                  strokeWidth=".7"
                />
              ))}
            </g>
            <g transform="rotate(38 360 320)">
              <path
                d="M360 162C536 162 640 230 640 320S536 478 360 478 80 410 80 320 184 162 360 162ZM360 202C224 202 130 254 130 320S224 438 360 438 590 386 590 320 496 202 360 202Z"
                fill={"url(#stone-" + id + ")"}
                fillRule="evenodd"
              />
              <ellipse
                cx="360"
                cy="320"
                rx="280"
                ry="158"
                fill="none"
                stroke={"url(#edge-" + id + ")"}
                strokeWidth="1.5"
              />
              <ellipse
                cx="360"
                cy="320"
                rx="230"
                ry="118"
                fill="none"
                stroke="#EFE9E1"
                strokeOpacity=".6"
                strokeWidth="1"
              />
              {Array.from({ length: 8 }, (_, i) => (
                <ellipse
                  key={i}
                  cx="360"
                  cy="320"
                  rx={235 + i * 5}
                  ry={123 + i * 4}
                  fill="none"
                  stroke="#D1C7BD"
                  strokeOpacity=".14"
                  strokeWidth=".8"
                />
              ))}
            </g>
            <path
              d="M203 160Q235 130 276 116M584 310Q598 346 580 379"
              stroke="#EFE9E1"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity=".8"
            />
          </svg>
        </div>
        <span className="study-drag-hint" aria-hidden="true">
          {dragging ? "Rotate" : "Drag to rotate"}
        </span>
      </div>
      <figcaption id={"study-help-" + id}>
        Decorative glass study{" "}
        <span>Drag with a mouse, or use arrow keys. Home resets the view.</span>
      </figcaption>
      <button
        type="button"
        className="study-reset"
        onClick={() => paint(-9, -18)}
      >
        Reset view
      </button>
    </figure>
  );
}
