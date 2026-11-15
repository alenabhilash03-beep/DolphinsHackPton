/** Export the accepted server arrays and receipts without invoking the browser model. */
const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
export function scientificCSV(result){
 const rows=[['result_id','scenario_id','scenario_label','time_h','central_concentration_nM','target_site_concentration_nM','occupancy_fraction']];
 const labels=new Map(result.configuration.scenarios.map(s=>[s.scenario_id,s.label]));
 for(const scenario of result.scenarios)for(let index=0;index<result.time_h.length;index++)rows.push([result.result_id,scenario.scenario_id,labels.get(scenario.scenario_id),result.time_h[index],scenario.central_concentration_nM[index],scenario.target_site_concentration_nM[index],scenario.occupancy[index]]);
 return rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
export function saveScientificFile(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function scientificPDF(result,cached){
 const {jsPDF}=await import('jspdf'),pdf=new jsPDF();let y=24;
 const line=(text,size=10)=>{pdf.setFontSize(size);const lines=pdf.splitTextToSize(String(text),170);for(const part of lines){if(y>270){pdf.addPage();y=22;}pdf.text(part,20,y);y+=size*.48+3;}};
 line('Hypothesim / scientific results',20);line(result.configuration.drug+' / '+result.configuration.target,14);line(cached?'Saved reference result. No live research was run for this view.':'Accepted scientific service result.');line('Result: '+result.result_id);line('Configuration: '+result.configuration_hash);line('Model: '+result.model_version+' / Solver: '+result.solver_version);line('Duration: '+result.configuration.duration_h+' h');
 for(const scenario of result.scenarios){const config=result.configuration.scenarios.find(s=>s.scenario_id===scenario.scenario_id);line(config?.label||scenario.scenario_id,13);line('Endpoint occupancy: '+(scenario.occupancy.at(-1)*100).toFixed(4)+'%');line('Concentration AUC: '+scenario.metrics.concentration_auc_nM_h+' nM·h');line('Occupancy AUC: '+scenario.metrics.occupancy_auc_h+' h');line('Threshold status: '+scenario.metrics.threshold.status);}
 line('These are conditional mathematical predictions. Target occupancy does not establish clinical efficacy or a dosing recommendation.');
 for(const source of result.configuration.sources||[])line((source.citation||source.title||source.source_id)+' '+(source.url||''),9);
 pdf.save('hypothesim-scientific-result.pdf');
}
