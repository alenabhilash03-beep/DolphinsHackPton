'use client';
import {useEffect,useRef} from 'react';

export default function GlassBackground({motion=true}){
 const root=useRef(null);
 useEffect(()=>{
  const element=root.current;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  let frame=null,attached=false,latest={x:0,y:0};
  const paint=()=>{frame=null;const {x,y}=latest;element.style.setProperty('--glass-x',(x*8).toFixed(2)+'px');element.style.setProperty('--glass-y',(y*6).toFixed(2)+'px');element.style.setProperty('--glass-light-x',(x*75).toFixed(2)+'px');element.style.setProperty('--glass-light-y',(y*50).toFixed(2)+'px');element.style.setProperty('--glass-angle',(x*.25).toFixed(3)+'deg')};
  const reset=()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;latest={x:0,y:0};paint()};
  const move=e=>{if(e.pointerType==='touch'||e.isPrimary===false)return;latest={x:Math.max(-1,Math.min(1,e.clientX/Math.max(1,window.innerWidth)*2-1)),y:Math.max(-1,Math.min(1,e.clientY/Math.max(1,window.innerHeight)*2-1))};if(frame===null)frame=requestAnimationFrame(paint)};
  const leave=e=>{if(!e.relatedTarget)reset()};
  const detach=()=>{if(!attached)return;window.removeEventListener('pointermove',move);window.removeEventListener('pointerout',leave);window.removeEventListener('pointercancel',reset);window.removeEventListener('blur',reset);attached=false};
  const sync=()=>{const active=motion&&!reduced.matches&&fine.matches&&!document.hidden;detach();reset();element.dataset.interactive=active?'true':'false';if(active){window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerout',leave);window.addEventListener('pointercancel',reset);window.addEventListener('blur',reset);attached=true}};
  reduced.addEventListener('change',sync);fine.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);sync();
  return()=>{detach();if(frame!==null)cancelAnimationFrame(frame);reduced.removeEventListener('change',sync);fine.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync)};
 },[motion]);
 return <div ref={root} className="glass-background" aria-hidden="true" data-interactive="false"><svg className="glass-field" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" focusable="false"><defs>
 <linearGradient id="glass-burgundy" x1="0" y1="0" x2="1" y2=".8"><stop stopColor="#72383D" stopOpacity=".04"/><stop offset=".45" stopColor="#72383D" stopOpacity=".38"/><stop offset=".9" stopColor="#AC9C8D" stopOpacity=".07"/><stop offset="1" stopColor="#D1C7BD" stopOpacity=".16"/></linearGradient>
 <linearGradient id="glass-stone" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#D1C7BD" stopOpacity=".03"/><stop offset=".5" stopColor="#AC9C8D" stopOpacity=".12"/><stop offset="1" stopColor="#EFE9E1" stopOpacity=".015"/></linearGradient>
 <linearGradient id="glass-edge" x1="0" y1="0" x2=".6" y2="1"><stop stopColor="#EFE9E1" stopOpacity=".02"/><stop offset=".4" stopColor="#D1C7BD" stopOpacity=".22"/><stop offset="1" stopColor="#AC9C8D" stopOpacity=".02"/></linearGradient>
 <radialGradient id="glass-reflection" cx=".66" cy=".35" r=".6"><stop stopColor="#EFE9E1" stopOpacity=".13"/><stop offset=".5" stopColor="#D1C7BD" stopOpacity=".025"/><stop offset="1" stopColor="#D1C7BD" stopOpacity="0"/></radialGradient>
 <clipPath id="glass-shapes"><path d="M1050-160 1640 70 1360 1120 850 910Z M-150 620 260 410 750 1090 80 1180Z M720-120 1130-80 760 1040 460 930Z"/></clipPath>
 </defs>
 <g className="glass-pane glass-pane-stone"><path d="M720-120 1130-80 760 1040 460 930Z" fill="url(#glass-stone)"/><path d="M720-120 460 930 760 1040" fill="none" stroke="url(#glass-edge)" strokeWidth="1"/><path d="M732-120 476 922 766 1030" fill="none" stroke="#322D29" strokeOpacity=".18" strokeWidth="4"/></g>
 <g className="glass-pane glass-pane-burgundy"><path d="M1050-160 1640 70 1360 1120 850 910Z" fill="url(#glass-burgundy)"/><path d="M1050-160 850 910 1360 1120" fill="none" stroke="url(#glass-edge)" strokeWidth="1.2"/><path d="M1066-160 868 900 1368 1100" fill="none" stroke="#D1C7BD" strokeOpacity=".035" strokeWidth="10"/><path d="M1640 70 1120 550 850 910" fill="none" stroke="#D1C7BD" strokeOpacity=".055" strokeWidth=".8"/></g>
 <g className="glass-pane glass-pane-taupe"><path d="M-150 620 260 410 750 1090 80 1180Z" fill="url(#glass-stone)"/><path d="M-150 620 260 410 750 1090" fill="none" stroke="url(#glass-edge)" strokeWidth=".8"/></g>
 <g clipPath="url(#glass-shapes)"><rect className="glass-reflection" x="-200" y="-200" width="2000" height="1400" fill="url(#glass-reflection)"/></g>
 </svg><div className="glass-reading-shade"/></div>
}
