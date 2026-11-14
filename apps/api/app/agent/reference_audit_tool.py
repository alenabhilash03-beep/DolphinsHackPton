"""Read-only audit tool; generalized agent orchestration remains 7C."""
from langchain_core.tools import tool
from app.research.reference_audits import load_reference_audit


@tool
def read_reference_audit(drug: str) -> dict:
    """Read a documented scientific reference audit and evidence gaps if available. Audit presence is not a drug allowlist. Candidate facts and structures do not authorize a simulation."""
    try:
        audit=load_reference_audit(drug)
    except KeyError:
        return {'audit_available':False,'runnable':False,'reason':'No audit for this name. Independent source research and preparation remain available.'}
    return {'audit_available':True,'audit':audit.model_dump(mode='json')}
