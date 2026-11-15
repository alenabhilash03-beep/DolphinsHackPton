"use client";
import { useState, type FormEvent } from "react";
import type { PreparationRecord, PreparationUpdate } from "../lib/contracts";
import { parameterLabel, unitLabel } from "../lib/investigation";
import { humanize, locatorLabel } from "../lib/readable";
const FIELDS = [
  ["pk.volume_L","Effective distribution volume","L"], ["pk.clearance_L_h","Effective clearance","L/hour"],
  ["binding.association_nM_inv_h_inv","Association rate","nM^-1 hour^-1"], ["binding.dissociation_h_inv","Dissociation rate","hour^-1"],
  ["molecular_weight_g_mol","Molecular weight for the specified form","g/mol"], ["body_mass_kg","Body mass","kg"], ["exposure_factor","Prescribed target-site / central exposure factor","1"],
];
export function PreparationAnswers({ record, busy, onContinue, onReload }: {
  record: PreparationRecord; busy: boolean; onContinue: (update: PreparationUpdate) => void; onReload: () => void;
}) {
  const [values,setValues]=useState<Record<string,string>>({});
  const [rationale,setRationale]=useState(record.scope?.rationale ?? "");
  const [form,setForm]=useState(record.scope?.molecular_form ?? record.identity_molecular_form ?? "");
  const [species,setSpecies]=useState(record.scope?.species ?? "");
  const [compartment,setCompartment]=useState(record.scope?.target_compartment ?? "");
  const [binding,setBinding]=useState(record.scope?.binding_regime ?? "unknown");
  const [pk,setPk]=useState(record.scope?.pk_regime ?? "unknown");
  const [competition,setCompetition]=useState(record.scope?.competition ?? "unknown");
  const [duration,setDuration]=useState(record.design?.duration_h.toString() ?? "");
  const [dose,setDose]=useState(record.design?.administration[0]?.amount_mg.toString() ?? "");
  const [infusion,setInfusion]=useState("1");
  const [route,setRoute]=useState(record.preparation.request.route ?? "");
  const [declared,setDeclared]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const prep=record.preparation;
  const unresolved=["not_found","unavailable","ambiguous"].includes(record.identity_status);
  function submit(event: FormEvent) {
    event.preventDefault(); setError(null);
    try {
      if (!confirmed || !rationale.trim()) throw new Error("Confirm your assumptions and provide their rationale.");
      const update: PreparationUpdate={base_revision:prep.revision,base_evidence_sha256:prep.evidence_sha256,parameters:[]};
      if (unresolved && declared && (!form.trim() || !species.trim() || !compartment)) throw new Error("Declare the hypothetical molecular form, species and compartment first.");
      if (unresolved && declared) { update.declare_hypothetical_identity=true; update.identity_rationale=rationale; }
      const exposureCompartment=compartment || record.scope?.target_compartment;
      for (const [field,,unit] of FIELDS) {
        if (!values[field]?.trim()) continue;
        const value=Number(values[field]);
        if (!Number.isFinite(value) || (field==="exposure_factor" ? value<0 : value<=0)) throw new Error("Enter finite positive values (exposure may be zero).");
        if (!exposureCompartment) throw new Error("Declare a target compartment for assumed parameters.");
        const parameterId=`answer-${crypto.randomUUID()}`;
        update.selected_parameters ??= {}; update.selected_parameters[field]=parameterId;
        update.parameters!.push({parameter_id:parameterId,parameter:field,value,unit,original_value:value,original_unit:unit,
          applicability:"candidate",formula:null,normalization:"Researcher entered canonical units",provenance:"researcher_assumed",rationale,entered_at:new Date().toISOString(),
          context:{drug_identifier:prep.resolved_drug_identifier ?? `user:${record.identity_molecular_form ?? form}`,target_identifier:prep.resolved_target_identifier,
            assay_conditions:null,experimental_system:null,formulation:null,route:null,molecular_form:form,species:species || null,exposure_compartment:exposureCompartment,applicability_notes:[rationale]}});
      }
      if(update.parameters!.some(p=>p.parameter.startsWith("binding."))) update.selected_parameters!["binding.affinity_nM"]=null;
      if(update.parameters!.some(p=>p.parameter.startsWith("pk."))) update.selected_parameters!["pk.elimination_half_life_h"]=null;
      // Hypothetical identity is resolved by the server before numerical assumptions are submitted.
      if (unresolved && declared && update.parameters!.length) throw new Error("First declare the hypothetical identity with blank numerical fields. Then enter assumptions using its returned identifier.");
      if (form && species && compartment) update.scope={molecular_form:form,species,target_compartment:compartment as "extracellular"|"intracellular"|"other",
        binding_regime:binding,pk_regime:pk,competition,rationale};
      if (duration || dose) {
        const hours=Number(duration), amount=Number(dose), infusionHours=Number(infusion);
        if (!duration || !dose || !Number.isFinite(hours) || hours<=0 || !Number.isFinite(amount) || amount<0) throw new Error("Specify a positive duration and nonnegative amount in mg.");
        if (!["iv_infusion","hypothetical_iv_bolus"].includes(route)) throw new Error("Choose an explicit supported IV input.");
        if (route==="iv_infusion" && (!Number.isFinite(infusionHours) || infusionHours<=0)) throw new Error("Specify a positive infusion duration.");
        update.design={duration_h:hours,initial_amount_nmol:record.design?.initial_amount_nmol ?? 0,initial_occupancy:record.design?.initial_occupancy ?? 0,occupancy_threshold:record.design?.occupancy_threshold ?? 0.9,administration:route==="iv_infusion" ? [{kind:"infusion",start_h:0,duration_h:infusionHours,amount_mg:amount}] : [{kind:"hypothetical_bolus",start_h:0,amount_mg:amount}],rationale};
      }
      const routeQuestion=(prep.missing_inputs ?? []).find(q=>q.input_id==="route");
      if (routeQuestion && route) update.answers={route};
      if (!update.scope && !update.design && !update.parameters!.length && !declared && !update.answers) throw new Error("Supply an answer, scope or design before continuing.");
      onContinue(update);
    } catch (e) { setError(e instanceof Error ? e.message : "Check your inputs."); }
  }
  return <section className="interpretation-panel" aria-label="Evidence and missing inputs">
    <h2>Review evidence & complete the experiment</h2><p>Preparation: <code>{prep.preparation_id}</code> · version {prep.revision}</p>
    <p><strong>{prep.state}</strong> · identity {record.identity_status} · lookup {record.identity_retrieval_status}. Inputs remain conditional candidates.</p>
    <ul>{prep.reasons.map(r=><li key={r}>{r}</li>)}</ul>
    <ul>{(prep.missing_inputs ?? []).map(q=><li key={q.input_id}><strong>{q.parameter}</strong>: {q.question} {q.expected_unit && `(${q.expected_unit})`}</li>)}</ul>
    <details><summary>Extracted values, assumptions & source access ({(prep.parameters ?? []).length} values)</summary>
      {(prep.parameters ?? []).map(p=><article key={p.parameter_id}><strong>{parameterLabel(p.parameter)}: {p.value} {unitLabel(p.unit)}</strong> · {humanize(p.provenance)} · {humanize(p.applicability)}
        <p>{p.context.applicability_notes.join(" ")}</p>{(p.passages ?? []).map((passage,i)=><blockquote key={i}>{passage.supporting_passage} <small>({locatorLabel(passage.locator)})</small></blockquote>)}</article>)}
      {(prep.sources ?? []).map(s=><article key={s.source_id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><p>{s.content_kind} · {s.retrieval_status} · {s.retrieved_at}</p></article>)}
    </details>
    <button type="button" disabled={busy} onClick={onReload}>Reload preparation & latest version</button>
    {prep.state==="unsupported" ? <p>This mechanism cannot run in the implemented model. Start a new compatible research question.</p> : <form onSubmit={submit}><fieldset disabled={busy} style={{border:0,padding:0}}>
      <p>Blank fields preserve extracted inputs. Entered values explicitly replace the selected input for that field; original candidates remain in history. Each entered value is a hypothetical assumption, not a published measurement. Linked half-life and KD are calculated from compatible PK and kinetic pairs.</p>
      {unresolved && <label><input type="checkbox" checked={declared} onChange={e=>setDeclared(e.target.checked)} /> Declare an unverified hypothetical identity (no database identity or measured parameters claimed)</label>}
      <div className="form-grid">{FIELDS.map(([field,label,unit])=><label key={field}>{label} ({unit})<input type="number" step="any" value={values[field] ?? ""} onChange={e=>setValues({...values,[field]:e.target.value})} placeholder="No assumption supplied" /></label>)}</div>
      <details open={!record.scope}><summary>Explicit model scope</summary><div className="form-grid">
        <label>Molecular form<input value={form} onChange={e=>setForm(e.target.value)} /></label><label>Species<input value={species} onChange={e=>setSpecies(e.target.value)} placeholder="Declare species" /></label>
        <label>Target compartment<select value={compartment} onChange={e=>setCompartment(e.target.value)}><option value="">Choose compartment</option><option value="extracellular">Extracellular</option><option value="intracellular">Intracellular (prescribed exposure only)</option><option value="other">Other</option></select></label>
        <label>Binding model<select value={binding} onChange={e=>setBinding(e.target.value as typeof binding)}><option value="unknown">Not established</option><option value="reversible_1_to_1">Effective reversible 1:1</option><option value="irreversible">Irreversible (unsupported)</option><option value="cooperative">Cooperative (unsupported)</option></select></label>
        <label>PK regime<select value={pk} onChange={e=>setPk(e.target.value as typeof pk)}><option value="unknown">Not established</option><option value="linear_effective">Effective linear one compartment</option><option value="other">Other (unsupported)</option></select></label>
        <label>Competition<select value={competition} onChange={e=>setCompetition(e.target.value as typeof competition)}><option value="unknown">Not established</option><option value="absent_assumed">Explicitly assume absent</option><option value="effective_assay_rates">Rates include declared assay effects</option><option value="requires_explicit_model">Requires explicit model (unsupported)</option></select></label>
      </div></details>
      <details open={!record.design}><summary>Baseline administration & observation window</summary><p>New baselines start with zero free drug and zero occupancy; the analytical threshold is 0.9. Existing initial conditions are preserved. Doses below are hypothetical design inputs.</p><div className="form-grid">
        <label>Input route<select disabled={!!record.preparation.request.route && !(prep.missing_inputs ?? []).some(q=>q.input_id==="route")} value={route} onChange={e=>setRoute(e.target.value)}><option value="">Choose IV input</option><option value="iv_infusion">IV infusion</option><option value="hypothetical_iv_bolus">Hypothetical IV bolus</option></select></label>
        <label>Amount (mg)<input type="number" min="0" step="any" value={dose} onChange={e=>setDose(e.target.value)} /></label>
        <label>Duration (hours)<input type="number" min="0" step="any" value={duration} onChange={e=>setDuration(e.target.value)} /></label>
        {route==="iv_infusion" && <label>Infusion duration (hours)<input type="number" min="0" step="any" value={infusion} onChange={e=>setInfusion(e.target.value)} /></label>}
      </div></details>
      <label>Assumption / design rationale<textarea required value={rationale} onChange={e=>setRationale(e.target.value)} /></label>
      <label><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I explicitly authorize this structured baseline and the hypothetical values/scope I supplied. Occupancy is not clinical efficacy.</label>
      {error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>Apply answers & continue research</button></fieldset>
    </form>}
  </section>;
}
