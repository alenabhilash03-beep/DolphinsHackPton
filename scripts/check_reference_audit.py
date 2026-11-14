"""Offline reference manifest/structure check; never runs an LLM or enables a drug."""
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from app.research.reference_audits import load_reference_audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--drug", default="imatinib")
    args = parser.parse_args()
    audit = load_reference_audit(args.drug)
    print(f"Audit: {audit.audit_id} v{audit.version}")
    print(f"Status: {audit.status}; runnable={audit.runnable}")
    print(f"Sources: {len(audit.sources)}; candidate facts: {len(audit.facts)}")
    print(f"Verified experimental coordinates: {audit.structure.pdb_id}, {audit.structure.target_species}")
    print(f"SHA-256: {audit.structure.sha256}")
    print("No simulation or evidence promotion performed.")


if __name__ == "__main__":
    main()
