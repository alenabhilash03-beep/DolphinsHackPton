'use client';
import {ChevronDown} from 'lucide-react';

/** Native disclosure keeps controls mounted, so folding a section preserves its state. */
export default function ExperimentDisclosure({id,title,description,initiallyOpen=false,className='',children}){
 return <details id={id} className={'experiment-disclosure '+className} open={initiallyOpen||undefined}>
  <summary><span className="experiment-disclosure-title">{title}</span>{description&&<span className="experiment-disclosure-description">{description}</span>}<ChevronDown size={15} aria-hidden="true"/></summary>
  <div className="experiment-disclosure-body">{children}</div>
 </details>;
}

/** Reveal the destination before scrolling to a section from the experiment navigation. */
export function revealExperimentSection(id){
 const target=document.getElementById(id);if(!target)return;
 for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
 if(id==='condition-inspector'){const primary=target.querySelector('#exposure-conditions');if(primary)primary.open=true;}
 target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 if(!target.matches('button,input,select,textarea,summary,a[href]'))target.setAttribute('tabindex','-1');
 target.focus({preventScroll:true});
}
