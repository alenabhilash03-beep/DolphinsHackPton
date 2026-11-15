'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { nearestTimeIndex, readoutAtIndex } from '../lib/timeline.js';
export function useSimulationTimeline(result, playbackDurationMs = 24000) {
    const [timeHours, setTime] = useState(0), [playing, setPlaying] = useState(false), [started, setStarted] = useState(false), [revealEnabled, setRevealEnabled] = useState(true);
    const timeRef = useRef(0), anchor = useRef({
        wall: 0,
        time: 0
    });
    const horizonHours = result?.configuration.duration_h ?? 0;
    const index = result ? nearestTimeIndex(result.time_h, timeHours) : 0, readout = readoutAtIndex(result, index);
    useEffect(()=>{
        setPlaying(false);
        setStarted(false);
        const time = Math.min(timeRef.current, horizonHours);
        timeRef.current = time;
        setTime(time);
    }, [
        result,
        horizonHours
    ]);
    const seekTime = useCallback((value)=>{
        const time = Math.max(0, Math.min(horizonHours, value));
        timeRef.current = time;
        anchor.current = {
            wall: performance.now(),
            time
        };
        setTime(time);
    }, [
        horizonHours
    ]);
    const seekIndex = useCallback((index)=>{
        if (result) seekTime(result.time_h[Math.max(0, Math.min(result.time_h.length - 1, Math.round(index)))]);
    }, [
        result,
        seekTime
    ]);
    const pause = useCallback(()=>setPlaying(false), []);
    const play = useCallback(()=>{
        if (!result || playbackDurationMs <= 0) return;
        const time = timeRef.current >= horizonHours ? 0 : timeRef.current;
        timeRef.current = time;
        setTime(time);
        anchor.current = {
            wall: performance.now(),
            time
        };
        setStarted(true);
        setPlaying(true);
    }, [
        result,
        horizonHours,
        playbackDurationMs
    ]);
    const toggle = useCallback(()=>playing ? pause() : play(), [
        playing,
        pause,
        play
    ]);
    useEffect(()=>{
        if (!playing) return;
        let frame, last = -Infinity;
        const tick = (now)=>{
            const time = Math.min(horizonHours, anchor.current.time + (now - anchor.current.wall) * horizonHours / playbackDurationMs);
            timeRef.current = time;
            if (now - last >= 1000 / 30 || time >= horizonHours) {
                setTime(time);
                last = now;
            }
            if (time >= horizonHours) {
                setPlaying(false);
                return;
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return ()=>cancelAnimationFrame(frame);
    }, [
        playing,
        horizonHours,
        playbackDurationMs
    ]);
    useEffect(()=>{
        const hidden = ()=>{
            if (document.hidden) pause();
        };
        document.addEventListener('visibilitychange', hidden);
        return ()=>document.removeEventListener('visibilitychange', hidden);
    }, [
        pause
    ]);
    return {
        index,
        timeHours,
        timeDays: timeHours / 24,
        horizonHours,
        progress: horizonHours ? timeHours / horizonHours : 0,
        readout,
        playing,
        revealCurves: revealEnabled && started,
        revealEnabled,
        setRevealEnabled,
        maxIndex: Math.max(0, (result?.time_h.length ?? 1) - 1),
        seekIndex,
        seekTime,
        play,
        pause,
        toggle
    };
}
