import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.research.paper_summaries import load_paper_summaries
from app.research.registry import load_curated_profile

def test_paper_summaries_are_source_linked_and_explain_graph_roles():
    summaries = load_paper_summaries(load_curated_profile().experiment)
    pk, binding = summaries
    assert pk.source_id == "S2" and "concentration" in pk.plot_ids
    assert binding.source_id == "S3" and binding.plot_ids == ["occupancy"]
    assert "does not change the PK" in binding.use_in_model
    assert "not reproduced patient predictions" in pk.limitation

def test_summary_cannot_be_attached_to_the_wrong_parameter_source():
    experiment = load_curated_profile().experiment.model_copy(deep=True)
    next(item for item in experiment.evidence if item.evidence_id == "kon").source_ids = ["S2"]
    with pytest.raises(ValueError, match="source-linked"):
        load_paper_summaries(experiment)

def test_evidence_route_includes_summaries_without_claiming_live_retrieval():
    body = TestClient(app).get("/api/research/evidence/trastuzumab").json()
    assert body["retrieval_status"] == "cached"
    assert len(body["paper_summaries"]) == 2
