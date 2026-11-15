/* Local draft lifecycle around the pinned scientific controller; no solver/model changes. */
module.exports=function adaptHypothesis(text){
 const replace=(from,to)=>{if(!text.includes(from))throw Error('Hypothesis adaptation boundary missing: '+from.slice(0,90));text=text.replace(from,to)};
 replace('fallbackExperiment,initialSnapshot=null,','fallbackExperiment={drug:"",target:"",title:"New experiment",scenarios:[]},initialSnapshot=null,');
 replace('useState(PRIMARY),[drug,setDrug]=useState("trastuzumab"),[target,setTarget]=useState("HER2"),[route,setRoute]=useState("iv_infusion")','useState(""),[drug,setDrug]=useState(""),[target,setTarget]=useState(""),[route,setRoute]=useState("")');
 replace('[agentMode,setAgentMode]=useState("edit")','[agentMode,setAgentMode]=useState("research")');
 replace('useState("Run this comparison for 120 days")','useState("")');
 // New drafts never restore a cached hypothesis or resume another experiment's agent job.
 const start=text.indexOf('  useEffect(()=>{\n    if(!backendAvailable)return;\n    try {');
 const end=text.indexOf('  useEffect(()=>{\n    if(!jobId) return;',start);
 if(start<0||end<0)throw Error('Automatic restoration boundary missing');
 text=text.slice(0,start)+'  useEffect(()=>()=>{epoch.current.next();activeJob.current=null;reopenTicket.current++;},[]);\n'+text.slice(end);
 replace('setPrepared(result); setShown(result); setExplanation(next.interpretation ?? null); setSaved(false);','setPrepared(result); setShown(result); setExplanation(next.interpretation ?? null); setSaved(false);setAgentMode("edit");');
 replace('    event.preventDefault();\n    setResearchOpen(false);setTurn(null);setRecord(null);','    event.preventDefault();\n    if(busy||!backendAvailable||!researchAvailable||!text.trim()||!drug.trim())return;\n    setPrepared(null);setShown(null);setExplanation(null);setSelected(null);setSaved(false);\n    setResearchOpen(false);setTurn(null);setRecord(null);');
 replace('setShown(result);setSelected(scenario);setControlBusy(pending);onResultSnapshot?.(result);},[onResultSnapshot]);','setShown(result);setSelected(scenario);setControlBusy(pending);},[]);\n  useEffect(()=>{onResultSnapshot?.(shown,{savedReference:saved&&shown?.result_id===prepared?.result_id});},[shown,saved,prepared,onResultSnapshot]);');
 replace('setRoute("iv_infusion");setBaseline(false);','setRoute("iv_infusion");setBaseline(false);setAgentMode("edit");setEdit("");');
 return text;
};
