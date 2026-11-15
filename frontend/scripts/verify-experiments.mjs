import assert from 'node:assert/strict';
import {defaults,defaultsForKind,normalize,scenarios,getScenarios,concentrationAt,bindingAt,series,evaluate,summarize,pdResponse,sourceFor,bundle,plotSeries} from '../app/model.mjs';
import {figureSVG,csvData,htmlReport} from '../app/export-files.mjs';
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b}`);
// Analytical PK checks, including variable volume and repeated doses.
const pk={...defaultsForKind('pkpd'),dose:100,volume:5,half:10,interval:365,duration:40};
close(concentrationAt(pk,scenarios[0],0),20);close(concentrationAt(pk,scenarios[0],10),10);
close(summarize(pk,scenarios[0]).auc,20*10/Math.LN2*(1-2**-4));
close(concentrationAt({...pk,duration:1000},scenarios[0],400),20*2**-40);const repeated={...pk,interval:10};close(concentrationAt(repeated,scenarios[0],10),30);close(concentrationAt(repeated,scenarios[0],20),35);
close(pdResponse(pk,pk.ec50),pk.e0+pk.emax/2);assert.equal(pdResponse({...pk,pdModel:'none'},10),null);
close(pdResponse({...pk,hill:2},pk.ec50*2),pk.e0+pk.emax*.8);
// Independently integrate finite-pool binding with RK4 in seconds.
function rk4(A,T,kon,koff,seconds){let B=0,dt=.02;const f=b=>kon*1e-9*(A-b)*(T-b)-koff*b;for(let t=0;t<seconds-1e-8;t+=dt){const h=Math.min(dt,seconds-t),a=f(B),b=f(B+h*a/2),c=f(B+h*b/2),d=f(B+h*c);B+=h*(a+2*b+2*c+d)/6}return B}
const assay={...defaultsForKind('binding'),ligand:12,target:8,kd:4,kon:20000,washout:0};
const at=bindingAt(assay,getScenarios(assay)[0],60/86400);close(at.bound,rk4(12,8,20000,4e-9*20000,60),1e-8);close(at.freeLigand+at.bound,12);assert.ok(at.bound<=8);
const equilibrium=bindingAt(assay,scenarios[0],100).bound;close((12-equilibrium)*(8-equilibrium),4*equilibrium,1e-7);
const curve=plotSeries(repeated,scenarios[0]);const before=curve.find(v=>Math.abs(v.t-(10-1e-8))<1e-12),after=curve.find(v=>v.t===10);assert.ok(after.concentration-before.concentration>19.99,'Dose event has an explicit jump');const wash={...assay,washout:10/1440};const B=bindingAt(wash,scenarios[0],wash.washout).bound;
close(bindingAt(wash,scenarios[0],wash.washout+60/86400).bound,B*Math.exp(-4e-9*20000*60));assert.equal(bindingAt(wash,scenarios[0],wash.washout).freeLigand,0);
const variants=getScenarios(assay);const one=bindingAt({...assay,washout:0},variants[1],100),two=bindingAt({...assay,washout:0},variants[2],100);close(one.bound,two.bound,1e-6);assert.ok(bindingAt(assay,variants[2],1/1440).bound>bindingAt(assay,variants[1],1/1440).bound);
// Combined kinetic solution checked against an independent, slow-rate RK4 reference.
const combined={...defaults,half:3,kon:10,kd:10,duration:1,interval:365};
let theta=0;const dt=1/100000;const f=(t,v)=>{const c=concentrationAt(combined,scenarios[0],t)*1000/combined.mw;return combined.kon*1e-9*86400*(c*(1-v)-combined.kd*v)};
for(let i=0;i<100000;i++){const t=i*dt,a=f(t,theta),b=f(t+dt/2,theta+dt*a/2),c=f(t+dt/2,theta+dt*b/2),d=f(t+dt,theta+dt*c);theta+=dt*(a+2*b+2*c+d)/6}
close(evaluate(combined,scenarios[0],1).occupancy,theta*100,1e-5);assert.equal(evaluate(combined,scenarios[0],0).occupancy,0);
const legacy=normalize({dose:150,half:21,kd:20,interval:365,duration:84});assert.equal(legacy.bindingModel,'equilibrium');assert.ok(evaluate(legacy,scenarios[0],0).occupancy>0);
for(const kind of ['pkpd','binding','combined'])for(const s of getScenarios({kind})){const p=defaultsForKind(kind),rows=series(p,s);assert.equal(rows.length,505);for(const v of rows){assert.ok(Number.isFinite(v.concentration));if(v.occupancy!==null)assert.ok(v.occupancy>=0&&v.occupancy<=100)}const summary=summarize(p,s);assert.ok(summary.timeAbove>=0&&summary.timeAbove<=p.duration+1e-9);const exp={title:'Example <unsafe>',question:'Question',p};const csv=csvData(exp);assert.equal(csv.trim().split('\n').length,1516);const figure=figureSVG(exp);assert.ok(!/NaN|Infinity/.test(figure));assert.ok(!figure.includes('<unsafe>'));const report=htmlReport(exp,[],[]);assert.ok(report.includes(kind==='binding'?'finite antibody':'')||report.includes('Conditions'));assert.equal(bundle(exp).model.version,'2.1')}
const sourced={...defaults,sources:{dose:{status:'literature',citation:'doi:10.example — measured in vitro'},half:{status:'literature',citation:''}}};assert.equal(sourceFor(sourced,'dose').status,'literature');assert.equal(sourceFor(sourced,'half').status,'illustrative');assert.ok(htmlReport({title:'Test',question:'Q',p:sourced},[],[]).includes('measured in vitro'));
console.log('Passed: analytical PK/AUC, repeated doses, finite-pool binding vs independent RK4, mass conservation, washout, same-KD kinetics, combined kinetics vs RK4, Emax/Hill, bounds, legacy migration, provenance, and exports for all experiment types.');
