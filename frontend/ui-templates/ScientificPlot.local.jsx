'use client';
import {memo,useCallback,useEffect,useMemo,useRef} from 'react';
import dynamic from 'next/dynamic';
import {buildScientificPlot,scenarioColor} from '../lib/plot-spec.js';
import {interpolateSample} from '../../playback-visual.mjs';
const Plot=dynamic(async()=>{const [factory,plotly]=await Promise.all([import('react-plotly.js/factory'),import('plotly.js/dist/plotly-basic.min.js')]);return factory.default(plotly.default)},{ssr:false});
const size={width:'100%',height:'100%'};
const StaticChart=memo(function StaticChart({spec,onGraph,onSeek}){
 const ready=useCallback((_,graph)=>onGraph(graph),[onGraph]);
 const relayout=useCallback(()=>onGraph(),[onGraph]);
 const purge=useCallback(()=>onGraph(null),[onGraph]);
 const click=useCallback(event=>{const x=event.points[0]?.x;if(typeof x==='number')onSeek?.(x*24)},[onSeek]);
 return <Plot data={spec.data} layout={spec.layout} config={spec.config} useResizeHandler style={size} onInitialized={ready} onUpdate={ready} onRelayout={relayout} onPurge={purge} onClick={click}/>;
});
export function ScientificPlot({result,kind,cursorTimeHours,onSeekTime,showTargetSite,className,revealProgress=false}){
 const shell=useRef(null),graph=useRef(null),geometry=useRef(null),line=useRef(null),shade=useRef(null),label=useRef(null),markers=useRef([]),latest=useRef({time:cursorTimeHours,reveal:revealProgress});latest.current={time:cursorTimeHours,reveal:revealProgress};
 const spec=useMemo(()=>{const spec=buildScientificPlot(result,kind,0,{showTargetSite,cursor:false});return {...spec,layout:{...spec.layout,paper_bgcolor:'#181716',plot_bgcolor:'#181716',font:{family:'Geist, Arial, sans-serif',color:'#d2ccc5',size:11},legend:{...spec.layout.legend,font:{size:11,color:'#cfc8c0'}},hoverlabel:{bgcolor:'#24211f',bordercolor:'#6f665e',font:{family:'Geist, Arial, sans-serif',size:12,color:'#f1ede7'}},xaxis:{...spec.layout.xaxis,gridcolor:'#eee8e010'},yaxis:{...spec.layout.yaxis,gridcolor:'#eee8e014'}}}},[result,kind,showTargetSite]);
 const paint=useCallback(()=>{const area=geometry.current;if(!area)return;const {time,reveal}=latest.current,day=time/24,{left,top,width,height,xmin,xmax,ymin,ymax}=area;const visible=xmax>xmin&&day>=xmin&&day<=xmax;
  for(const node of [line.current,shade.current,label.current,...markers.current])if(node)node.style.display=visible?'block':'none';if(!visible)return;
  const x=(day-xmin)/(xmax-xmin)*width;
  Object.assign(line.current.style,{height:height+'px',transform:`translate3d(${left+x}px,${top}px,0)`});
  Object.assign(shade.current.style,{display:reveal?'block':'none',height:height+'px',width:Math.max(0,width-x)+'px',transform:`translate3d(${left+x}px,${top}px,0)`});
  const text='Day '+day.toFixed(1);if(label.current.textContent!==text)label.current.textContent=text;label.current.style.transform=`translate3d(${Math.max(left,Math.min(left+x,left+width-70))}px,${Math.max(0,top-23)}px,0)`;
  result.scenarios.forEach((series,index)=>{const node=markers.current[index];if(!node)return;const value=interpolateSample(result.time_h,kind==='occupancy'?series.occupancy:series.central_concentration_nM,time)*(kind==='occupancy'?100:1);const show=ymax>ymin&&value>=ymin&&value<=ymax;node.style.display=show?'block':'none';if(show)node.style.transform=`translate3d(${left+x}px,${top+(1-(value-ymin)/(ymax-ymin))*height}px,0) translate(-50%,-50%)`;});
 },[result,kind]);
 const measure=useCallback(()=>{const plot=graph.current,host=shell.current,drag=plot?.querySelector('.nsewdrag'),layout=plot?._fullLayout;if(!host||!drag||!layout)return;const outer=host.getBoundingClientRect(),rect=drag.getBoundingClientRect();geometry.current={left:rect.left-outer.left,top:rect.top-outer.top,width:rect.width,height:rect.height,xmin:layout.xaxis.range[0],xmax:layout.xaxis.range[1],ymin:layout.yaxis.range[0],ymax:layout.yaxis.range[1]};paint()},[paint]);
 const onGraph=useCallback(value=>{if(value===null){graph.current=null;geometry.current=null;return;}if(value)graph.current=value;measure()},[measure]);
 useEffect(()=>paint(),[cursorTimeHours,revealProgress,paint]);
 useEffect(()=>{let frame;const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};const observer=new ResizeObserver(resize);if(shell.current)observer.observe(shell.current);window.addEventListener('resize',resize);return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize)}},[measure]);
 return <div ref={shell} className={'smooth-scientific-plot '+(className||'')} style={{minHeight:320,position:'relative'}}><StaticChart spec={spec} onGraph={onGraph} onSeek={onSeekTime}/><div ref={shade} className="plot-progress-shade" aria-hidden="true"/><div ref={line} className="plot-progress-line" aria-hidden="true"/><div ref={label} className="plot-time-label" aria-hidden="true"/>{result.scenarios.map((series,index)=><div key={series.scenario_id} ref={node=>{markers.current[index]=node}} className="plot-sample-marker" aria-hidden="true" style={{background:scenarioColor(series.scenario_id,index)}}/>)}</div>;
}
