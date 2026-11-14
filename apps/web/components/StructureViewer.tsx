"use client";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GLViewer, AtomSpec, AtomSelectionSpec } from "3dmol";
import { STRUCTURES, TOUR, parseCoordinates, parseResidueLabel, residueKey, residueLabel, role, interfaceContacts, residueContacts, type CoordinateModel, type Contact, type ResidueRef, type StructureKind } from "../lib/structure-geometry";

type Library=typeof import("3dmol");
function selection(refs:ResidueRef[]):AtomSelectionSpec {
  const keys=new Set(refs.map(residueKey));
  return {predicate:(atom:AtomSpec)=>keys.has(residueKey({chain:atom.chain ?? "",resi:atom.resi ?? NaN,icode:atom.icode?.trim() ?? "",resn:atom.resn ?? ""}))};
}

/** Camera/annotations only; deposited coordinates have no simulation dependency. */
export function StructureViewer({kind="trastuzumab"}:{kind?:StructureKind}) {
  const profile=STRUCTURES[kind],imatinib=kind==="imatinib";
  const host=useRef<HTMLDivElement>(null),viewer=useRef<GLViewer|null>(null),library=useRef<Library|null>(null);
  const motion=useRef<number|null>(null);
  const [scriptReady,setScriptReady]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const [model,setModel]=useState<CoordinateModel|null>(null),[verified,setVerified]=useState(false);
  const [visible,setVisible]=useState<string[]>(profile.chains.map(c=>c.id)),[surface,setSurface]=useState(false),[contacts,setContacts]=useState(true);
  const [selected,setSelected]=useState<ResidueRef|null>(null),[pair,setPair]=useState<Contact|null>(null),[notice,setNotice]=useState("Click a protein residue or the imatinib ligand to inspect deposited geometry.");
  const [inspectChain,setInspectChain]=useState(imatinib?"A":"C"),[residueNumber,setResidueNumber]=useState(imatinib?"315":"557");
  const [step,setStep]=useState(-1),[playing,setPlaying]=useState(false),[systemReduced,setSystemReduced]=useState(false),[reduceMotion,setReduceMotion]=useState(false);
  const reduced=systemReduced||reduceMotion;
  const interfacePairs=useMemo(()=>model?interfaceContacts(model.atoms,kind):[],[model,kind]);
  const neighbors=useMemo(()=>model&&selected?residueContacts(model.atoms,selected,kind):[],[model,selected,kind]);
  const own=useMemo(()=>model&&selected?model.atoms.filter(a=>residueKey(a)===residueKey(selected)):[],[model,selected]);
  function cancelMotion(){if(motion.current!==null)cancelAnimationFrame(motion.current);motion.current=null;}
  function stop(){setPlaying(false);cancelMotion();}
  function focus(sel:AtomSelectionSpec, context=false) {
    const v=viewer.current;if(!v || !v.selectedAtoms(sel).length)return;
    cancelMotion();
    const before=v.getView();v.zoomTo(sel);if(context)v.zoom(.65);const after=v.getView();
    if(reduced){v.render();return;}
    v.setView(before);const started=performance.now();
    function frame(now:number){
      const progress=Math.min(1,(now-started)/600),ease=progress*progress*(3-2*progress);
      // zoomTo changes translation/zoom, preserving rotation. Never interpolate atomic coordinates.
      const view=before.map((value,index)=>index<4?value+(after[index]-value)*ease:after[index]);
      v!.setView(view);v!.render();
      motion.current=progress<1?requestAnimationFrame(frame):null;
    }
    motion.current=requestAnimationFrame(frame);
  }
  function choose(ref:ResidueRef,focusResidue=false) {
    stop();setSelected(ref);setPair(null);setInspectChain(ref.chain);setResidueNumber(residueLabel(ref));
    setVisible(ids=>[...new Set([...ids,ref.chain])]);setNotice(`Selected ${ref.resn} ${ref.chain}:${residueLabel(ref)}.`);
    if(focusResidue)focus(selection([ref]),true);
  }
  function choosePair(contact:Contact) {
    stop();setSelected(contact.a);setPair(contact);setInspectChain(contact.a.chain);setResidueNumber(residueLabel(contact.a));
    setVisible(ids=>[...new Set([...ids,contact.a.chain,contact.b.chain])]);
    setNotice("Orange marks the selected residue; cyan marks its coordinate-derived counterpart. The line is a geometric measurement.");
    focus(selection([contact.a,contact.b]),true);
  }
  function go(index:number) {
    const next=Math.max(0,Math.min(TOUR.length-1,index));setStep(next);setNotice(TOUR[next].description);setContacts(true);setVisible(profile.chains.map(c=>c.id));setPair(null);setSelected(null);
    if(next===0)focus({hetflag:false});
    if(next===1)focus(imatinib?{chain:"A"}:{or:[{chain:"A"},{chain:"B"}]});
    if(next===2)focus(selection(interfacePairs.flatMap(p=>[p.a,p.b])));
    if(next===3 && interfacePairs.length){
      const contact=interfacePairs[0];setSelected(contact.a);setPair(contact);setInspectChain(contact.a.chain);setResidueNumber(residueLabel(contact.a));
      focus(selection([contact.a,contact.b]),true);
    }
  }
  useEffect(()=>{
    const preference=window.matchMedia("(prefers-reduced-motion: reduce)");
    const change=()=>setSystemReduced(preference.matches);change();preference.addEventListener("change",change);
    return ()=>preference.removeEventListener("change",change);
  },[]);
  useEffect(()=>{if(reduced){setPlaying(false);cancelMotion();}},[reduced]);
  useEffect(()=>{
    if(!playing||reduced)return;
    if(step>=TOUR.length-1){setPlaying(false);return;}
    const timer=setTimeout(()=>go(step+1),5500);
    return ()=>clearTimeout(timer);
  },[playing,step,reduced]);
  useEffect(()=>{
    if(!scriptReady||!host.current)return;
    const element=host.current,abort=new AbortController();let resize:ResizeObserver|undefined,instance:GLViewer|undefined;
    setLoaded(false);setVerified(false);setModel(null);setSelected(null);setPair(null);setStep(-1);setPlaying(false);
    const lib=(window as unknown as {$3Dmol:Library}).$3Dmol;library.current=lib;
    void fetch(`/structures/${profile.id}.pdb`,{signal:abort.signal}).then(async response=>{
      if(!response.ok)throw new Error("Cached structure unavailable");
      const bytes=await response.arrayBuffer();
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
      if(digest!==profile.sha256)throw new Error("Experimental coordinate checksum mismatch");
      const pdb=new TextDecoder().decode(bytes),parsed=parseCoordinates(pdb);if(abort.signal.aborted)return;
      lib.setSyncSurface(true);instance=lib.createViewer(element,{backgroundColor:"#f4f7f2",antialias:true});instance.addModel(pdb,"pdb");
      const bySerial=new Map(parsed.atoms.map(a=>[a.serial,a]));
      const click=(atom:AtomSpec)=>{const ref=bySerial.get(atom.serial ?? -1);if(ref&&role(ref,kind))choose(ref);};
      instance.setClickable({hetflag:false},true,click);
      if(imatinib)instance.setClickable({resn:"STI"},true,click);
      viewer.current=instance;instance.zoomTo({hetflag:false});instance.render();
      resize=new ResizeObserver(()=>{instance?.resize();instance?.render();});resize.observe(element);
      setModel(parsed);setVerified(true);setLoaded(true);
    }).catch(()=>{if(!abort.signal.aborted)setError("Experimental structure could not be verified or rendered. Scientific plots remain usable. Check the cached asset and WebGL support.");});
    return ()=>{abort.abort();cancelMotion();resize?.disconnect();instance?.clear();viewer.current=null;element.replaceChildren();};
  },[scriptReady,attempt,profile.id]);
  useEffect(()=>{
    const v=viewer.current;if(!loaded||!v||!library.current)return;
    v.setStyle({},{});v.removeAllSurfaces();v.removeAllShapes();v.removeAllLabels();
    for(const chain of profile.chains.filter(c=>visible.includes(c.id))) {
      const sel={chain:chain.id,hetflag:false};v.setStyle(sel,{cartoon:{color:chain.color,opacity:pair ? 0.28 : 1}});
      if(surface)void v.addSurface(library.current.SurfaceType.MS,{opacity:.28,color:chain.color},sel);
    }
    if(contacts){const refs=interfacePairs.flatMap(p=>[p.a,p.b]).filter(ref=>visible.includes(ref.chain));if(refs.length)v.addStyle(selection(refs),{stick:{radius:.15,colorscheme:"element",opacity:pair ? 0.25 : 1}});}
    if(imatinib)for(const chain of visible)v.setStyle({resn:"STI",chain},{stick:{radius:.23,color:"#d6a64a"}});
    if(selected && visible.includes(selected.chain))v.addStyle(selection([selected]),{stick:{radius:.25,color:"#e36536",opacity:1}});
    if(pair && visible.includes(pair.a.chain)&&visible.includes(pair.b.chain)){
      v.addStyle(selection([pair.b]),{stick:{radius:.23,color:"#18a4ad",opacity:1}});
      v.addStyle({serial:pair.a.serial},{sphere:{radius:.32,color:"#e36536"}});
      v.addStyle({serial:pair.b.serial},{sphere:{radius:.32,color:"#18a4ad"}});
      v.addLine({start:{x:pair.a.x,y:pair.a.y,z:pair.a.z},end:{x:pair.b.x,y:pair.b.y,z:pair.b.z},color:"#283d34",linewidth:3});
      v.addLabel(`${pair.distance.toFixed(2)} Å`,{position:{x:(pair.a.x+pair.b.x)/2,y:(pair.a.y+pair.b.y)/2,z:(pair.a.z+pair.b.z)/2},fontSize:15,inFront:true,backgroundColor:"#ffffff",fontColor:"#183c30",backgroundOpacity:.9});
    }
    v.render();
  },[loaded,visible,surface,contacts,selected,pair,interfacePairs,profile,imatinib]);
  function inspect(){
    try{
      const ref=parseResidueLabel(residueNumber),found=model?.atoms.find(a=>a.protein&&a.chain===inspectChain&&a.resi===ref.resi&&a.icode===ref.icode);
      if(found){choose(found,true);return;}
      stop();setSelected(null);setPair(null);
      const missing=model?.unresolved.find(a=>a.chain===inspectChain&&a.resi===ref.resi&&a.icode===ref.icode);
      setNotice(missing?`${missing.resn} ${inspectChain}:${residueLabel(missing)} is listed as unresolved in depositor REMARK 465. No atoms or side chains are reconstructed.`:`No resolved coordinates for ${inspectChain}:${residueNumber}. It may be outside the construct, absent or unresolved; the reason is not inferred.`);
    }catch(e){setNotice(e instanceof Error?e.message:"Check the residue identifier.");}
  }
  const entity=selected&&own.length?(role(own[0],kind)==="drug"?imatinib?"Imatinib ligand (STI)":"Trastuzumab Fab":"Target protein"):null;
  return <section id="structure" className="structure-panel" aria-label="Experimental molecular structure">
    <Script key={attempt} src={`/vendor/3Dmol-2.5.5.min.js?attempt=${attempt}`} onReady={()=>setScriptReady(true)} onError={()=>setError("Molecular renderer unavailable. Scientific plots remain usable.")}/>
    <p className="eyebrow">02 / EXPERIMENTAL GEOMETRY</p><h2>Experimental structure · {profile.id}</h2><p>{profile.description}. {profile.scope} Dose, affinity and playback never deform these coordinates.</p>
    <div className="molecular-tour" aria-label="Guided molecular tour">
      <div className="form-actions"><button disabled={!loaded} onClick={()=>{go(0);setPlaying(!reduced);}}>Start guided tour</button><button disabled={!playing} onClick={stop}>Pause tour</button>
        <button disabled={!loaded||step<=0} onClick={()=>{stop();go(step-1);}}>Previous stop</button><button disabled={!loaded||step>=TOUR.length-1} onClick={()=>{stop();go(step+1);}}>Next stop</button></div>
      <label><input type="checkbox" checked={reduced} disabled={systemReduced} onChange={e=>setReduceMotion(e.target.checked)}/> Reduce camera motion</label>
      <p aria-live="polite">{step<0?"Four stops: assembly → partners → interface → measured contact.":`Stop ${step+1} of ${TOUR.length} · ${TOUR[step].title}. ${TOUR[step].description}`}</p>
      {reduced&&<p>Reduced motion: camera framing is immediate. Advance with Next stop; auto-advance is disabled.</p>}
    </div>
    <div className="structure-tools">{profile.chains.map(chain=><label key={chain.id} style={{color:chain.color}}><input type="checkbox" checked={visible.includes(chain.id)} onChange={()=>{stop();setVisible(ids=>ids.includes(chain.id)?ids.filter(id=>id!==chain.id):[...ids,chain.id]);}}/>{chain.id}: {chain.label}</label>)}</div>
    <div className="form-actions"><label><input type="checkbox" checked={surface} onChange={e=>{stop();setSurface(e.target.checked);}}/> Molecular surfaces</label><label><input type="checkbox" checked={contacts} onChange={e=>{stop();setContacts(e.target.checked);}}/> Interface residues within 4 Å</label>
      <button disabled={!loaded} onClick={()=>{stop();setStep(-1);focus({hetflag:false});}}>Reset camera</button>
      <button disabled={!loaded} onClick={()=>{stop();focus(imatinib?{chain:"A"}:{or:[{chain:"A"},{chain:"B"}]});}}>{imatinib?"Focus kinase copy A":"Focus Fab"}</button>
      <button disabled={!loaded} onClick={()=>{stop();focus(imatinib?{resn:"STI",chain:"A"}:{chain:"C"});}}>{imatinib?"Focus imatinib copy A":"Focus HER2"}</button></div>
    <div className="structure-inspection-layout"><div><div ref={host} onPointerDown={stop} onWheel={stop} aria-label={`Interactive ${profile.id} molecular canvas`} className="molecular-canvas"/>
      <p>Drag to rotate; scroll to zoom. Manual canvas interaction pauses the tour.</p></div>
      <aside className="residue-sidebar" aria-label="Coordinate inspection sidebar"><h3>Inspect the experimental interface</h3><p>Geometric proximity only; no binding energy or affinity is inferred.</p>
        <form onSubmit={e=>{e.preventDefault();inspect();}}><label>Inspect chain<select value={inspectChain} onChange={e=>setInspectChain(e.target.value)}>{profile.chains.map(c=><option key={c.id}>{c.id}</option>)}</select></label>
          <label>Author residue number<input value={residueNumber} onChange={e=>setResidueNumber(e.target.value)} placeholder="557 or 100A"/></label><button disabled={!loaded}>Inspect residue</button></form>
        {imatinib&&<button disabled={!loaded} onClick={()=>{const ligand=model?.atoms.find(a=>a.resn==="STI"&&a.chain==="A");if(ligand)choose(ligand,true);}}>Inspect imatinib ligand</button>}
        <p role="status">{error ?? (!loaded?"Loading and verifying experimental coordinates…":notice)}</p>
        {selected&&<><h4>{selected.resn} {selected.chain}:{residueLabel(selected)}</h4><p>{entity} · {own.length} resolved heavy atoms. Atom completeness is not inferred.</p>
          <h4>Nearest opposite-partner residues</h4><p>Minimum heavy-atom distance per counterpart, in Å{imatinib?"; same crystal copy only":"; Fab ↔ HER2 only"}.</p>
          {!neighbors.some(c=>c.distance<=4)&&<p>No opposite-partner residue within the 4 Å display cutoff.</p>}
          {pair&&<p className="measurement-readout">{pair.a.resn} {pair.a.chain}:{residueLabel(pair.a)} {pair.a.atom} ↔ {pair.b.resn} {pair.b.chain}:{residueLabel(pair.b)} {pair.b.atom}: <strong>{pair.distance.toFixed(3)} Å</strong></p>}
          <ol className="contact-list">{neighbors.slice(0,6).map(c=><li key={residueKey(c.b)}><button onClick={()=>choosePair(c)}>{c.b.resn} {c.b.chain}:{residueLabel(c.b)} · {c.distance.toFixed(2)} Å</button><small>{c.a.atom} ↔ {c.b.atom}{c.distance>4?" · outside 4 Å":" · within 4 Å"}</small></li>)}</ol>
        </>}
        {!selected&&loaded&&<><p>{interfacePairs.length} residue pairs meet the 4 Å geometric cutoff.</p><button disabled={!interfacePairs.length} onClick={()=>choosePair(interfacePairs[0])}>Inspect closest interface pair</button></>}
        <p className="scope-note">These are coordinate-derived distances, not hydrogen-bond assignments, binding energies, KD, kon or koff. No residue-specific kinetic effect is inferred. Waters, glycans and hydrogens are excluded.</p>
      </aside></div>
    {error&&<button onClick={()=>{stop();setError(null);setLoaded(false);setScriptReady(false);setAttempt(n=>n+1);}}>Retry structure</button>}
    <details><summary>Experimental provenance & inspection limits</summary><p>{verified?"SHA-256 verified against the audited cached asset.":"Asset verification pending."} {profile.sha256}</p><p>Only the first deposited coordinate model is inspected. Alternate atom conformers are rejected rather than mixed. Missing coordinates and side chains are never synthesized. Distance rounding does not imply experimental precision.</p><a href={`https://www.rcsb.org/structure/${profile.id}`} target="_blank" rel="noreferrer">RCSB PDB {profile.id} source ↗</a></details>
  </section>;
}
