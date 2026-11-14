"""Refresh only bibliographic cache metadata after exact source-identity checks."""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))

from app.research.europe_pmc import EuropePMCClient  # noqa: E402
from app.research.registry import CachedSourceRecord, DATA_ROOT, load_curated_profile, validate_literature_identity  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Replace checked-in bibliographic cache records after validation")
    args = parser.parse_args()
    profile = load_curated_profile()
    client = EuropePMCClient()
    for check in profile.literature_checks:
        live = client.lookup_pmid(check.pmid)
        validate_literature_identity(live, check)
        cached = CachedSourceRecord(
            source_id=check.source_id, provider="Europe PMC", provider_source="MED",
            provider_id=live.provider_id, pmid=check.pmid, pmcid=check.pmcid, doi=check.doi,
            title=live.title, publication_year=live.publication_year,
            abstract_available=live.abstract_available, full_text_status=live.full_text_status,
            full_text_url=live.full_text_url, record_url=live.record_url,
            retrieved_at=live.retrieved_at.isoformat(),
            cache_scope="Bibliographic metadata and availability only; not a reviewed numeric source or cached full text",
        )
        if args.write:
            target = DATA_ROOT / "research/cache" / f"{check.pmid}.json"
            temporary = target.with_suffix(".json.tmp")
            temporary.write_text(cached.model_dump_json(indent=2) + "\n")
            temporary.replace(target)
        print(f"{check.source_id}: exact PMID {check.pmid} and DOI verified; cache {'updated' if args.write else 'unchanged'}")


if __name__ == "__main__":
    main()
