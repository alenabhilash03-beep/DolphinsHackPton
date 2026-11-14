"""Bounded live identity checks; no LLM or numerical simulation is invoked."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from app.research.chembl import ChEMBLIdentityClient
from app.research.drug_identity import DrugAssessmentService
from app.schemas.drug_support import DrugAssessmentRequest

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Contact the public ChEMBL API")
    parser.add_argument("--refresh-cache", action="store_true", help="Write verified identity records to the checked-in seed cache")
    args = parser.parse_args()
    if not args.live:
        print("Pass --live to invoke the public identity API; no provider key is required.")
        return 2
    client = ChEMBLIdentityClient(cache_dir=ROOT / "data/research/identity-cache" if args.refresh_cache else None)
    service = DrugAssessmentService(client)
    for name, expected in (("Herceptin", "reviewed_identity"), ("imatinib", "candidate_identity"), ("Gleevec", "ambiguous")):
        result = service.assess(DrugAssessmentRequest(drug_name=name))
        assert result.identity_status == expected, f"Unexpected identity status for {name}: {result.identity_status}"
        if name != "Herceptin":
            assert result.retrieval_status == "live", "Live verification must not be claimed from cached data"
            assert not result.model_eligible
        print(json.dumps({"drug": name, "identity_status": result.identity_status, "support":result.support.status,
                          "retrieval":result.retrieval_status, "model_eligible":result.model_eligible, "runnable":result.runnable,
                          "identifiers":[item.identifiers for item in result.candidates]}))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
