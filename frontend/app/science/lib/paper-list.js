/**
 * Papers behind the current result, for the Evidence tab's "Delve deeper" list. Pure.
 * Agent-read papers come first, then the experiment's input sources; one entry per publication (matched by
 * PMCID, PMID or DOI). A paper can be opened in the reader only if it has a PMCID or PMID (Europe PMC text).
 */ const clean = (value)=>typeof value === "string" && value.trim() ? value.trim() : null;
const pmcOf = (ids)=>{
    const v = clean(ids.pmcid);
    return v && /^PMC\d{1,12}$/i.test(v) ? v.toUpperCase() : null;
};
const pmidOf = (ids)=>{
    const v = clean(ids.pmid);
    return v && /^\d{6,10}$/.test(v) ? v : null;
};
export function readerKey(ids) {
    const values = ids ?? {};
    const pmc = pmcOf(values), pmid = pmidOf(values);
    return pmc ?? (pmid ? `PMID${pmid}` : null);
}
function labels(ids) {
    const pmc = pmcOf(ids), pmid = pmidOf(ids), doi = clean(ids.doi);
    return [
        pmc,
        pmid ? `PMID ${pmid}` : null,
        doi ? `doi:${doi}` : null
    ].filter((v)=>!!v);
}
// Plain-language note for how an agent-read paper relates to the plotted model (enum codes are never shown).
const USE = {
    reviewed_reference_separate: "Checked against the audited model inputs; the curves use the reviewed reference values.",
    see_parameter_lineage: "Values from this paper feed the model; see each input's lineage under Evidence.",
    not_selected: "Read for context; no values from it were used in the model."
};
const KIND = {
    full_text: "Full text",
    abstract: "Abstract"
};
const SOURCE_KIND = {
    product_label: "Product label",
    primary_study: "Primary study",
    review: "Review"
};
export function listPapers(turn, experiment) {
    const out = [];
    const seen = new Map();
    const keysOf = (ids)=>[
            pmcOf(ids),
            pmidOf(ids) && `pmid:${pmidOf(ids)}`,
            clean(ids.doi)?.toLowerCase()
        ].filter((v)=>!!v);
    const add = (paper, ids)=>{
        const keys = keysOf(ids);
        const existing = keys.map((key)=>seen.get(key)).find(Boolean);
        if (existing) {
            // Merge identifiers so an input source with only a PMID can open the agent's full-text copy.
            existing.key ??= paper.key;
            existing.url ??= paper.url;
            existing.usedFor ??= paper.usedFor;
            for (const label of paper.identifiers)if (!existing.identifiers.includes(label)) existing.identifiers.push(label);
            for (const key of keys)seen.set(key, existing);
            return;
        }
        out.push(paper);
        for (const key of keys)seen.set(key, paper);
    };
    for (const paper of turn?.research_papers ?? []){
        const ids = paper.source.identifiers ?? {};
        add({
            id: paper.document_id ?? paper.source.source_id ?? `paper-${out.length}`,
            key: readerKey(ids),
            title: clean(paper.source.title) ?? "Untitled paper",
            url: europePmcUrl(ids) ?? clean(paper.source.url),
            origin: "agent",
            access: KIND[paper.source.content_kind ?? ""] ?? null,
            identifiers: labels(ids),
            usedFor: USE[paper.use_in_simulation ?? ""] ?? null
        }, ids);
    }
    for (const source of experiment?.sources ?? []){
        const ids = source.identifiers ?? {};
        add({
            id: source.source_id,
            key: readerKey(ids),
            title: clean(source.title) ?? source.source_id,
            url: clean(source.url),
            origin: "input",
            access: SOURCE_KIND[source.source_kind ?? ""] ?? null,
            identifiers: labels(ids),
            usedFor: null
        }, ids);
    }
    return out;
}
function europePmcUrl(ids) {
    const pmc = pmcOf(ids), pmid = pmidOf(ids);
    return pmc ? `https://europepmc.org/article/PMC/${pmc.slice(3)}` : pmid ? `https://europepmc.org/article/MED/${pmid}` : null;
}
