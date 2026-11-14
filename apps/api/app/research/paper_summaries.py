"""Reviewed, source-linked summaries; search candidates cannot become model evidence."""
import json
from pathlib import Path
from app.schemas.contracts import ExperimentConfig, PaperSummary

SUMMARY_PATH = Path(__file__).resolve().parents[4] / "data/research/paper-summaries.json"

def load_paper_summaries(experiment: ExperimentConfig) -> list[PaperSummary]:
    summaries = [PaperSummary.model_validate(item) for item in json.loads(SUMMARY_PATH.read_text())]
    sources = {source.source_id for source in experiment.sources}
    evidence = {item.evidence_id: item for item in experiment.evidence}
    for summary in summaries:
        if summary.source_id not in sources or not summary.evidence_ids:
            raise ValueError("Paper summary must cite registered scientific evidence")
        if any(key not in evidence or summary.source_id not in evidence[key].source_ids for key in summary.evidence_ids):
            raise ValueError("Paper summary does not match its source-linked parameter evidence")
    return summaries
