"use client";

import { useEffect, useMemo, useState } from "react";
import type { EvidenceProfile, ExperimentConfig } from "../lib/contracts";

/** Plain evidence view for the UI team to restyle; never upgrades cache metadata to reviewed data. */
export function EvidencePanel({ experiment, scenarioId }: { experiment: ExperimentConfig; scenarioId?: string | null }) {
  const [profile, setProfile] = useState<EvidenceProfile | null>(null);
  const [cacheError, setCacheError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/research/evidence/trastuzumab", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Evidence metadata unavailable");
        return response.json() as Promise<EvidenceProfile>;
      })
      .then((value) => { setProfile(value); setCacheError(false); })
      .catch(() => { if (!controller.signal.aborted) setCacheError(true); });
    return () => controller.abort();
  }, []);

  const scenario = experiment.scenarios.find((item) => item.scenario_id === scenarioId) ?? experiment.scenarios[0];
  const values = useMemo(() => {
    const byId = new Map(experiment.evidence.map((item) => [item.evidence_id, item]));
    return Object.entries(scenario.parameter_evidence).map(([path, id]) => ({ path, item: byId.get(id) })).filter((entry) => entry.item);
  }, [experiment.evidence, scenario.parameter_evidence]);
  const cacheBySource = new Map(profile?.literature.map((item) => [item.source_id, item]));

  return <section aria-label="Scientific evidence">
    <h2>Evidence and assumptions</h2>
    <p>Model scope: <strong>{experiment.support.status}</strong> · {experiment.support.reasons.join(" ")}</p>
    <p>{cacheError ? "Bibliographic cache unavailable; source links and the validated experiment remain visible." :
      profile ? "Europe PMC bibliographic metadata: cached, not a live search. Numerical inputs retain their separate reviewed or assumed provenance." :
      "Loading cached bibliographic metadata…"}</p>
    <h3>Sources</h3>
    <ul>{experiment.sources.map((source) => {
      const cached = cacheBySource.get(source.source_id);
      return <li key={source.source_id}>
        <a href={source.url} target="_blank" rel="noreferrer">{source.source_id} · {source.title}</a>
        {cached && <span> · PMID {cached.pmid} · abstract {cached.abstract_available ? "indexed" : "not indexed"}
          · full text {cached.full_text_status === "open_access_link" ? "open-access link indexed" : "not confirmed"}
          · cached {cached.retrieved_at.slice(0, 10)}</span>}
      </li>;
    })}</ul>
    <h3>Inputs for {scenario.label}</h3>
    <ul>{values.map(({ path, item }) => item && <li key={path}>
      <strong>{path}</strong>: {item.value.toPrecision(6)} {item.unit} · {item.provenance} · {item.review_status}
      {(item.source_ids?.length ?? 0) > 0 && <> · {item.source_ids?.join(", ")}{item.locator ? `, ${item.locator}` : ""}</>}
      {item.provenance === "user_supplied" && <> · unreviewed hypothetical input</>}
    </li>)}</ul>
    <h3>Limits</h3>
    <ul>{experiment.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
  </section>;
}
