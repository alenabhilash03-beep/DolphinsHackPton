# Identity-only seed cache

These ChEMBL lookup snapshots were retrieved and checked on 2026-11-14 with `scripts/check_drug_support.py --live --refresh-cache`. Each JSON file is named by the SHA-256 of its exact normalized query (`imatinib` or `gleevec`). The records retain their own source URL, retrieval time, identifiers, and `database_candidate` provenance.

Source: [ChEMBL molecule API](https://www.ebi.ac.uk/chembl/api/data/docs). The imatinib preferred-name query resolves `CHEMBL941`; the Gleevec exact synonym query returns that parent record and `CHEMBL1642` (imatinib mesylate). These identity records do not approve a PK/binding profile and contain no simulation parameter package. See [the support contract](../../../docs/DRUG_SUPPORT.md).
