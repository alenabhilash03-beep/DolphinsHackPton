"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SimulationResult } from "../lib/contracts";
import { nearestTimeIndex, readoutAtIndex } from "../lib/timeline";

export function useSimulationTimeline(result: SimulationResult | null, playbackDurationMs = 24_000) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [revealEnabled, setRevealEnabled] = useState(true);
  const indexRef = useRef(0);
  const displayedTimeRef = useRef(0);
  const anchorRef = useRef({ wallMs: 0, timeHours: 0 });
  const readout = readoutAtIndex(result, index);
  const timeHours = readout?.timeHours ?? 0;
  const horizonHours = result?.configuration.duration_h ?? 0;

  useEffect(() => {
    setPlaying(false);
    setPlaybackStarted(false);
    const next = result ? nearestTimeIndex(result.time_h, displayedTimeRef.current) : 0;
    indexRef.current = next;
    setIndex(next);
    displayedTimeRef.current = result?.time_h[next] ?? 0;
    anchorRef.current.timeHours = displayedTimeRef.current;
  }, [result]);

  const seekIndex = useCallback((requestedIndex: number) => {
    if (!result || result.time_h.length === 0) return;
    const next = Math.max(0, Math.min(result.time_h.length - 1, Math.round(requestedIndex)));
    indexRef.current = next;
    displayedTimeRef.current = result.time_h[next];
    setIndex(next);
    anchorRef.current = { wallMs: performance.now(), timeHours: result.time_h[next] };
  }, [result]);

  const seekTime = useCallback((requestedTimeHours: number) => {
    if (result) seekIndex(nearestTimeIndex(result.time_h, requestedTimeHours));
  }, [result, seekIndex]);

  const play = useCallback(() => {
    if (!result || playbackDurationMs <= 0) return;
    const current = result.time_h[indexRef.current] ?? 0;
    anchorRef.current = {
      wallMs: performance.now(),
      timeHours: current >= result.configuration.duration_h ? 0 : current,
    };
    if (current >= result.configuration.duration_h) {
      indexRef.current = 0;
      displayedTimeRef.current = 0;
      setIndex(0);
    }
    setPlaying(true);
    setPlaybackStarted(true);
  }, [result, playbackDurationMs]);

  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  useEffect(() => {
    if (!playing || !result) return;
    let frame = 0;
    const horizon = result.configuration.duration_h;
    const tick = (now: number) => {
      const target = Math.min(horizon, anchorRef.current.timeHours + (now - anchorRef.current.wallMs) * horizon / playbackDurationMs);
      const next = nearestTimeIndex(result.time_h, target);
      if (next !== indexRef.current) {
        indexRef.current = next;
        displayedTimeRef.current = result.time_h[next];
        setIndex(next);
      }
      if (target >= horizon) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, result, playbackDurationMs]);

  return {
    index: readout?.index ?? 0,
    timeHours,
    timeDays: readout?.timeDays ?? 0,
    horizonHours,
    progress: horizonHours > 0 ? timeHours / horizonHours : 0,
    readout,
    playing,
    revealCurves: revealEnabled && playbackStarted,
    revealEnabled, setRevealEnabled,
    maxIndex: Math.max(0, (result?.time_h.length ?? 1) - 1),
    seekIndex, seekTime, play, pause, toggle,
  };
}

export type SimulationTimelineController = ReturnType<typeof useSimulationTimeline>;
