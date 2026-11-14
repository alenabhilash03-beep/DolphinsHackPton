# Phase 3A evidence registry and literature retrieval

The runtime trastuzumab profile is [`data/drugs/trastuzumab.json`](../data/drugs/trastuzumab.json). It contains the audited, conditional experiment from Phase 0 and exact literature checks for the population PK paper (S2, PMID 30467591) and intact-antibody binding paper (S3, PMID 27043557). The 1N8Z reference explicitly describes a **Fab–HER2 extracellular-domain complex**, not a full antibody. The 0B example remains a contract fixture; the agent in 3B should load the runtime profile.

`app.research.registry.load_curated_profile()` validates the scientific contract, source identifiers, reviewed parameter locators, and intact-antibody context. `load_evidence_profile()` additionally checks the two committed Europe PMC bibliographic cache records. A mismatch is an error; it never changes a reviewed parameter or silently substitutes a paper. The cache contains identifiers, title, publication year, abstract availability, and an open-access link status. It does **not** contain an abstract, full text, or newly reviewed numerical values.

`app.research.europe_pmc.EuropePMCClient` queries the [Europe PMC Articles REST API](https://dev.europepmc.org/RestfulWebService) using `resultType=core` and JSON. Its bounded `search(query, page_size)` returns candidate literature with explicit `retrieval_status="live"`; `lookup_pmid` requires an exact PubMed ID and MED source. Missing abstracts remain `null`. A full-text link is marked `open_access_link` only when Europe PMC supplies an OA HTML URL; otherwise it is `not_confirmed`. This is an access status, not a statement that a paper lacks full text. Network/provider failures raise `RetrievalError` and the HTTP search endpoint returns 503. The validated cached profile remains available during an outage.

Endpoints:

| Route | Meaning |
| --- | --- |
| `GET /api/research/evidence/trastuzumab` | Audited conditional experiment plus clearly labeled cached bibliography and structural reference |
| `GET /api/research/search?q=...&limit=5` | Live Europe PMC candidate literature, at most 10 results; no parameter promotion |

The Next.js same-origin route `/api/research/evidence/trastuzumab` forwards the cached profile to the `EvidencePanel` in `/preview/plots`. The panel renders current scenario parameter values and provenance from the **current validated experiment**, so user edits show as candidate hypothetical inputs. The separate bibliographic cache status is never displayed as scientific review status. UI styling is the frontend contributor's responsibility.

To recheck the exact live records without changing cache files:

```sh
.venv/bin/python scripts/refresh_literature_cache.py
```

Use `--write` to replace only the bibliographic cache after exact identity and title checks; review the diff before committing. This command does not alter `trastuzumab.json` or upgrade new literature to a reviewed input. No AI provider key is required for any 3A route.
