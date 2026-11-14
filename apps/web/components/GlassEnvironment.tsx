'use client';

import { useEffect, useState, type ReactNode } from 'react';
import GlassBackground from './GlassBackground';

export function GlassEnvironment({ children }: { children: ReactNode }) {
  const [motion, setMotion] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    try { setMotion(localStorage.getItem('hypothesim-entry-motion') !== 'off'); }
    catch { setMotion(true); }
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function toggleMotion() {
    const next = !motion;
    setMotion(next);
    try { localStorage.setItem('hypothesim-entry-motion', next ? 'on' : 'off'); }
    catch { /* A blocked preference store must not interrupt workspace use. */ }
  }

  return <div className="glass-environment" data-motion={motion && !reduced ? 'on' : 'paused'}>
    <GlassBackground motion={motion && !reduced} />
    <div className="glass-content">
      <div className="glass-preferences">
        <button type="button" onClick={toggleMotion} disabled={reduced}
          aria-pressed={!motion || reduced}
          aria-label={reduced ? 'Background motion follows reduced-motion setting' : motion ? 'Pause background motion' : 'Enable background motion'}>
          {reduced ? 'Motion reduced' : motion ? 'Pause background motion' : 'Enable background motion'}
        </button>
      </div>
      {children}
    </div>
  </div>;
}
