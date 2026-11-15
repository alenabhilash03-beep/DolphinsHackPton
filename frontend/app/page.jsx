'use client';
import {useState,useEffect,useRef} from 'react';
import dynamic from 'next/dynamic';
import GlassBackground from './glass-background.jsx';
import StartPage from './start-page.jsx';
import ResearchGlyph from './research-glyph.jsx';
import {environments,viewForPath,pathForView,normalizePath} from './navigation.mjs';
import {playStartupSound,stopStartupSound} from './startup-sound.mjs';
import {playControlClick,stopControlClicks} from './interface-sound.mjs';
const Workspace=dynamic(()=>import('./workspace.jsx'),{ssr:false,loading:()=> <div className="workspace-loading" role="status"><span className="loading-orbit"/><span>Opening your research workspace…</span></div>});
export default function Home({initialSection='Home'}){
 const [scene,setScene]=useState(initialSection),[workspaceView,setWorkspaceView]=useState(initialSection==='Home'?'Overview':initialSection),[mountedWorkspace,setMountedWorkspace]=useState(initialSection!=='Home'),[transition,setTransition]=useState(null),[sound,setSound]=useState(true),[motion,setMotion]=useState(true);
 const sceneRef=useRef(initialSection),locked=useRef(false),timer=useRef(null),hasMotionChoice=useRef(false),routeHandler=useRef(null),scrollPositions=useRef(new Map());
 const showStart=scene==='Home';const entering=!!transition&&transition.from==='Home';
 useEffect(()=>{try{setSound(localStorage.getItem('hypothesim-entry-sound')!=='off');const preference=localStorage.getItem('hypothesim-entry-motion');hasMotionChoice.current=!!preference;setMotion(preference?preference==='on':!matchMedia('(prefers-reduced-motion: reduce)').matches)}catch{setMotion(!matchMedia('(prefers-reduced-motion: reduce)').matches)}const media=matchMedia('(prefers-reduced-motion: reduce)');const change=e=>{if(!hasMotionChoice.current)setMotion(!e.matches)};media.addEventListener('change',change);return()=>{media.removeEventListener('change',change);clearTimeout(timer.current);stopControlClicks();stopStartupSound()}},[]);
 useEffect(()=>{const current=viewForPath(window.location.pathname);if(current!==sceneRef.current){sceneRef.current=current;setScene(current);if(current!=='Home'){setMountedWorkspace(true);setWorkspaceView(current)}}const pop=()=>routeHandler.current?.(viewForPath(window.location.pathname),{history:false});window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
 useEffect(()=>{document.title=(environments[scene]?.label||'Research workspace')+' · Hypothesim';if(scene==='Home'&&mountedWorkspace)requestAnimationFrame(()=>{const h=document.querySelector('.entry-hero h1');h?.setAttribute('tabindex','-1');h?.focus({preventScroll:true})})},[scene]);
 function requestScene(next,{history=true,chime=false}={}){
  if(!environments[next])return;
  if(locked.current){if(history)return;clearTimeout(timer.current);locked.current=false;setTransition(null)}
  const previous=sceneRef.current;if(next===previous)return;
  scrollPositions.current.set(previous,window.scrollY||0);locked.current=true;
  const fromHome=previous==='Home';if(next!=='Home'){setMountedWorkspace(true);if(fromHome)setWorkspaceView(next)}
  if(fromHome&&chime&&sound)void playStartupSound();
  const animate=motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const delay=fromHome?(animate?920:60):(animate?140:0);
  setTransition({from:previous,to:next});
  const commit=()=>{sceneRef.current=next;setScene(next);if(next!=='Home')setWorkspaceView(next);if(history&&normalizePath(window.location.pathname)!==pathForView(next))window.history.pushState({hypothesimScene:next},'',pathForView(next));setTransition(null);locked.current=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,history?0:scrollPositions.current.get(next)||0)))};
  if(delay)timer.current=setTimeout(commit,delay);else commit();
 }
 routeHandler.current=requestScene;
 const toggleSound=()=>{const next=!sound;setSound(next);try{localStorage.setItem('hypothesim-entry-sound',next?'on':'off')}catch{}if(next)void playControlClick('toggle');else{stopStartupSound();stopControlClicks()}};
 function controlFeedback(event){if(!sound||transition)return;const node=event.target?.nodeType===1?event.target:event.target?.parentElement;const control=node?.closest?.('button,a[href],summary');if(!control||control.disabled||control.getAttribute('aria-disabled')==='true'||control.closest('[data-audio="startup"],[data-audio="mute"],[data-audio="silent"]'))return;const isToggle=control.tagName==='SUMMARY'||['tab','radio','switch'].includes(control.getAttribute('role'))||control.hasAttribute('aria-pressed')||control.hasAttribute('aria-expanded');const kind=isToggle?'toggle':control.closest('nav')||control.classList.contains('rail-profile')?'navigate':'action';void playControlClick(kind)}
 const toggleMotion=()=>setMotion(v=>{hasMotionChoice.current=true;try{localStorage.setItem('hypothesim-entry-motion',v?'off':'on')}catch{}return !v});
 return <div className="experience-root" onClickCapture={controlFeedback} data-motion={motion?'on':'paused'} data-scene={scene} data-changing={transition?'true':'false'}><GlassBackground motion={motion}/><div className="scene-content" inert={!!transition}>{showStart&&<StartPage onEnter={()=>requestScene('Overview',{chime:true})} onOpenSection={requestScene} entering={entering} sound={sound} onToggleSound={toggleSound} motion={motion} onToggleMotion={toggleMotion}/>} {mountedWorkspace&&<div className="workspace-stage" hidden={showStart} data-active={!showStart}><Workspace onReturnToStart={()=>requestScene('Home')} onNavigate={requestScene} requestedView={workspaceView} active={!showStart} sound={sound} onToggleSound={toggleSound}/></div>}</div>{transition&&<div className="environment-transition" data-kind={entering?'entry':'section'} aria-hidden="true"><div><ResearchGlyph name={environments[transition.to].glyph} size={28}/><span>{environments[transition.to].label}</span><small>{transition.to==='Home'?'Research environments':'Hypothesim / research environment'}</small></div></div>}<div className="scene-announcement" role="status" aria-live="polite">{transition?'Opening '+environments[transition.to].label+'.':''}</div></div>
}
