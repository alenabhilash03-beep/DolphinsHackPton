"use client";
import { useEffect, useRef, useState } from "react";

export function useWorkspaceNavigation(focusActive, active = true) {
  const [smallScreen, setSmallScreen] = useState(false),
    [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [focusVisible, setFocusVisible] = useState(false);
  const trigger = useRef(null),
    header = useRef(null),
    app = useRef(null);
  const visible = smallScreen
    ? mobile
    : focusActive
      ? focusVisible
      : !collapsed;
  useEffect(() => {
    const media = matchMedia("(max-width:760px)"),
      update = () => {
        setSmallScreen(media.matches);
        setMobile(false);
      };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => setFocusVisible(false), [focusActive]);
  useEffect(() => {
    if (!active) setMobile(false);
  }, [active]);
  useEffect(() => {
    const panel = document.getElementById("workspace-navigation");
    if (!visible && panel?.contains(document.activeElement))
      trigger.current?.focus({ preventScroll: true });
  }, [visible]);
  useEffect(() => {
    if (!smallScreen || !mobile) return;
    const panel = document.getElementById("workspace-navigation"),
      prior = document.activeElement,
      overflow = document.body.style.overflow;
    const controls = () =>
      Array.from(
        panel?.querySelectorAll("button:not(:disabled),a[href]") || [],
      );
    document.body.style.overflow = "hidden";
    controls()[0]?.focus();
    const key = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobile(false);
        return;
      }
      if (event.key !== "Tab") return;
      const list = controls(),
        first = list[0],
        last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      if (
        document.activeElement === document.body ||
        panel?.contains(document.activeElement) ||
        document.activeElement === prior
      ) {
        if (trigger.current?.isConnected)
          trigger.current.focus({ preventScroll: true });
      }
    };
  }, [smallScreen, mobile]);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const paint = () => {
      app.current?.style.setProperty(
        "--workspace-header-height",
        Math.ceil(element.getBoundingClientRect().height) + "px",
      );
    };
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(paint) : null;
    observer?.observe(element);
    paint();
    return () => observer?.disconnect();
  }, []);
  function toggle() {
    if (smallScreen) setMobile((v) => !v);
    else if (focusActive) setFocusVisible((v) => !v);
    else setCollapsed((v) => !v);
  }
  return {
    app,
    header,
    trigger,
    smallScreen,
    mobile,
    setMobile,
    visible,
    toggle,
  };
}
