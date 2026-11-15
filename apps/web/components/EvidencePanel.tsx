"use client";

import { useEffect, useMemo, useState } from "react";
import type { EvidenceProfile, ExperimentConfig } from "../lib/contracts";
import { PaperSummaries } from "./PaperSummaries";
import { parameterLabel, scientificNumber, unitLabel } from "../lib/investigation";
import { humanize, locatorLabel } from "../lib/readable";

/** Plain evidence view for the UI team to restyle; never upgrades cache metadata to reviewed data. */
export function EvidencePanel({ experiment, scenarioId, resultPresent = false, showSummaries = true }: {
  experiment: ExperimentConfig; scenarioId?: string | null; resultPresent?: boolean; showSummaries?: boolean;
}) {
  const [profile, setProfile] = useState<EvidenceProfile | null>(null);
  const [cacheError, setCacheError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const primary=experiment.mode!=="research_derived" && experiment.sources.some(source=>source.source_id==="S2");
  useEffect(() => {
    if(!primary){setProfile(null);setCacheError(false);return;}
    const controller = new AbortController();
    fetch("/api/research/evidence/trastuzumab", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Evidence metadata unavailable");
        return response.json() as Promise<EvidenceProfile>;
      })
      .then((value) => { setProfile(value); setCacheError(false); })
      .catch(() => { if (!controller.signal.aborted) setCacheError(true); });
    return () => controller.abort();
  }, [attempt,primary]);

  const scenario = experiment.scenarios.find((item) => item.scenario_id === scenarioId) ?? experiment.scenarios[0];
  const values = useMemo(() => {
    const byId = new Map(experiment.evidence.map((item) => [item.evidence_id, item]));
    return Object.entries(scenario.parameter_evidence).map(([path, id]) => ({ path, item: byId.get(id) })).filter((entry) => entry.item);
  }, [experiment.evidence, scenario.parameter_evidence]);
  const cacheBySource = new Map(profile?.literature.map((item) => [item.source_id, item]));

  return <section id="paper-evidence" aria-label="Scientific evidence">
    <h2>Evidence and assumptions</h2>
    <p>Model scope: <strong>{experiment.support.status}</strong> · {experiment.support.reasons.join(" ")}</p>
    <p>{!primary ? "Research-derived inputs remain conditional. Source access and snapshot status are shown in the preparation; no reviewed preset evidence is substituted." : cacheError ? "Bibliographic cache unavailable; source links and the validated experiment remain visible." :
      profile ? "Europe PMC bibliographic metadata: cached, not a live search. Numerical inputs retain their separate reviewed or assumed provenance." :
      "Loading cached bibliographic metadata…"}</p>
    {cacheError && <button type="button" onClick={() => { setCacheError(false); setAttempt((value) => value + 1); }}>Retry evidence metadata</button>}
    {showSummaries && primary && profile?.paper_summaries && <><h3>How each source is used</h3><PaperSummaries summaries={profile.paper_summaries} experiment={experiment} /></>}
    <details className="detail-bar"><summary>Parameter provenance · {scenario.label}</summary>
    <ul>{values.map(({ path, item }) => item && <li key={path}>
      <strong>{parameterLabel(path)}</strong>: {scientificNumber(item.value)} {unitLabel(item.unit)} · {humanize(item.provenance)} · {humanize(item.review_status)}
      {(item.source_ids?.length ?? 0) > 0 && <> · {item.source_ids?.join(", ")}{item.locator ? `, ${locatorLabel(item.locator)}` : ""}</>}
      {item.provenance === "user_supplied" && <> · unreviewed hypothetical input</>}
    </li>)}</ul>
    </details><h3>Limits</h3>
    <ul>{experiment.limitations.filter((limit) => !(resultPresent && limit === "Configuration fixture only: no simulator has run."))
      .map((limit) => <li key={limit}>{limit}</li>)}</ul>
  </section>;
}
