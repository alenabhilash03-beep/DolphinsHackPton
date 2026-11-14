"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { GLViewer, AtomSpec, AtomSelectionSpec } from "3dmol";

type Library = typeof import("3dmol");
const CHAINS = [
  { id: "A", label: "Trastuzumab Fab light chain", color: "#d6a64a" },
  { id: "B", label: "Trastuzumab Fab heavy chain", color: "#bd7295" },
  { id: "C", label: "HER2 extracellular domain", color: "#4e9c9b" },
];

/** Experimental geometry has no dependency on simulation parameters or playback. */
export function StructureViewer() {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<GLViewer | null>(null);
  const library = useRef<Library | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(["A", "B", "C"]);
  const [surface, setSurface] = useState(false);
  const [contacts, setContacts] = useState(true);
  const [residue, setResidue] = useState("Click a residue to inspect its chain and experimental residue number.");
  const [inspectChain, setInspectChain] = useState("C");
  const [residueNumber, setResidueNumber] = useState("557");

  useEffect(() => {
    if (!scriptReady || !host.current) return;
    const element = host.current;
    const abort = new AbortController();
    let resize: ResizeObserver | undefined;
    let instance: GLViewer | undefined;
    const lib = (window as unknown as { $3Dmol: Library }).$3Dmol;
    library.current = lib;
    void fetch("/structures/1N8Z.pdb", { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Cached structure unavailable");
      const pdb = await response.text();
      if (abort.signal.aborted) return;
      lib.setSyncSurface(true);
      instance = lib.createViewer(element, { backgroundColor: "#f4f7f2", antialias: true });
      instance.addModel(pdb, "pdb");
      instance.setClickable({ hetflag: false }, true, (atom: AtomSpec) => {
        setResidue(`Chain ${atom.chain} · ${atom.resn} ${atom.resi} · atom ${atom.atom}`);
      });
      viewer.current = instance;
      instance.zoomTo({ hetflag: false });
      instance.render();
      resize = new ResizeObserver(() => { instance?.resize(); instance?.render(); });
      resize.observe(element);
      setLoaded(true);
    }).catch(() => { if (!abort.signal.aborted) setError("The experimental structure could not load. Scientific plots remain usable. WebGL must be enabled."); });
    return () => {
      abort.abort(); resize?.disconnect(); instance?.clear();
      viewer.current = null; element.replaceChildren();
    };
  }, [scriptReady]);

  useEffect(() => {
    const v = viewer.current;
    if (!loaded || !v || !library.current) return;
    v.setStyle({}, {});
    v.removeAllSurfaces();
    for (const chain of CHAINS.filter((item) => visible.includes(item.id))) {
      const selection = { chain: chain.id, hetflag: false };
      v.setStyle(selection, { cartoon: { color: chain.color } });
      if (contacts) {
        const opposite = chain.id === "C" ? ["A", "B"].filter((id) => visible.includes(id)) : visible.includes("C") ? ["C"] : [];
        if (opposite.length) v.addStyle({ ...selection, byres: true, within: { distance: 4, sel: { or: opposite.map((id) => ({ chain: id, hetflag: false })) } } },
          { stick: { radius: 0.15, color: chain.color } });
      }
      if (surface) void v.addSurface(library.current.SurfaceType.MS, { opacity: 0.35, color: chain.color }, selection);
    }
    v.render();
  }, [loaded, visible, surface, contacts]);

  const focus = (selection: AtomSelectionSpec) => { viewer.current?.zoomTo(selection); viewer.current?.render(); };
  return <section id="structure" className="structure-panel" aria-label="Experimental molecular structure">
    <Script src="/vendor/3Dmol-2.5.5.min.js" onReady={() => setScriptReady(true)} onError={() => setError("Molecular renderer unavailable. Scientific plots remain usable.")} />
    <h2>Experimental structure · 1N8Z</h2>
    <p>Trastuzumab Fab bound to the HER2 extracellular domain · X-ray diffraction, 2.52 Å. This structure contains an antibody fragment and soluble target domain. Dose and kinetic changes do not alter its geometry.</p>
    <div>{CHAINS.map((chain) => <label key={chain.id} style={{ marginRight: 16, color: chain.color }}>
      <input type="checkbox" checked={visible.includes(chain.id)} onChange={() => setVisible((ids) => ids.includes(chain.id) ? ids.filter((id) => id !== chain.id) : [...ids, chain.id])} /> {chain.id}: {chain.label}
    </label>)}</div>
    <label><input type="checkbox" checked={surface} onChange={(event) => setSurface(event.target.checked)} /> Molecular surfaces</label>{" "}
    <label><input type="checkbox" checked={contacts} onChange={(event) => setContacts(event.target.checked)} /> Interface residues within 4 Å</label>{" "}
    <button disabled={!loaded} onClick={() => focus({ hetflag: false })}>Reset camera</button>{" "}
    <button disabled={!loaded} onClick={() => focus({ or: [{ chain: "A" }, { chain: "B" }] })}>Focus Fab</button>{" "}
    <button disabled={!loaded} onClick={() => focus({ chain: "C" })}>Focus HER2</button>
    <div><label>Inspect chain <select value={inspectChain} onChange={(event) => setInspectChain(event.target.value)}>
      {CHAINS.map((chain) => <option key={chain.id} value={chain.id}>{chain.id}</option>)}
    </select></label>{" "}
    <label>Residue number <input type="number" value={residueNumber} onChange={(event) => setResidueNumber(event.target.value)} /></label>{" "}
    <button disabled={!loaded} onClick={() => {
      const selection = { chain: inspectChain, resi: Number(residueNumber), hetflag: false };
      const atoms = viewer.current?.selectedAtoms(selection) ?? [];
      if (!atoms.length) { setResidue("No resolved protein residue at that chain and number in 1N8Z."); return; }
      setResidue(`Chain ${inspectChain} · ${atoms[0].resn} ${atoms[0].resi} · ${atoms.length} resolved atoms`);
      viewer.current?.addStyle(selection, { stick: { color: "#e36536", radius: 0.22 } });
      viewer.current?.render();
    }}>Inspect residue</button></div>
    <div ref={host} aria-label="Interactive 1N8Z molecular canvas" style={{ position: "relative", width: "100%", height: 460, border: "1px solid #cad6c7", marginTop: 12 }} />
    <p role="status">{error ?? (loaded ? residue : "Loading cached experimental structure…")}</p>
    <p>Drag to rotate; scroll to zoom. Interface sticks mark a geometric distance selection, not measured binding energy. <a href="https://www.rcsb.org/structure/1N8Z" target="_blank" rel="noreferrer">RCSB PDB source</a></p>
  </section>;
}
