"""Reviewed trastuzumab preset and bibliographic cache with strict provenance checks."""

import json
from datetime import datetime
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.research.europe_pmc import LiteratureRecord
from app.schemas.contracts import ExperimentConfig, MODEL_ID

DATA_ROOT = Path(__file__).resolve().parents[4] / "data"


class LiteratureCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str
    pmid: str
    pmcid: str
    doi: str
    title_terms: list[str] = Field(min_length=1)
    parameter_evidence_ids: list[str] = Field(min_length=1)


class StructureReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pdb_id: str
    url: str
    scope: str
    chains: dict[str, str]


class CuratedProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile_id: str
    aliases: list[str]
    drug_form: str
    target: str
    model_id: str
    experiment: ExperimentConfig
    literature_checks: list[LiteratureCheck]
    structure: StructureReference

    @model_validator(mode="after")
    def provenance_integrity(self):
        if self.model_id != MODEL_ID or "trastuzumab" not in [alias.lower() for alias in self.aliases]:
            raise ValueError("Unsupported curated model or drug identity")
        if self.experiment.mode != "reviewed_preset" or self.experiment.support.status != "conditional":
            raise ValueError("The reviewed trastuzumab preset must retain conditional scope")
        sources = {source.source_id: source for source in self.experiment.sources}
        evidence = {item.evidence_id: item for item in self.experiment.evidence}
        baseline_keys = set(self.experiment.scenarios[0].parameter_evidence.values())
        for check in self.literature_checks:
            source = sources.get(check.source_id)
            if not source or source.source_kind != "primary_study":
                raise ValueError("A literature check must identify a registered primary study")
            if source.identifiers.get("pmid") != check.pmid or source.identifiers.get("doi") != check.doi:
                raise ValueError("Curated source identifiers do not match their literature check")
            for key in check.parameter_evidence_ids:
                item = evidence.get(key)
                if not item or key not in baseline_keys or item.source_ids != [check.source_id]:
                    raise ValueError("A curated parameter must reference the exact checked source")
                if item.provenance != "reported" or item.review_status != "reviewed" or not item.locator:
                    raise ValueError("Curated source parameters need reviewed reported provenance and locators")
                if key in ("kon", "koff") and "intact trastuzumab" not in item.context.get("form", "").lower():
                    raise ValueError("Binding rates must be for intact trastuzumab, not fragments")
        return self


class CachedSourceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str
    provider: Literal["Europe PMC"]
    provider_source: Literal["MED"]
    provider_id: str
    pmid: str
    pmcid: str
    doi: str
    title: str
    publication_year: str | None
    abstract_available: bool
    full_text_status: Literal["open_access_link", "not_confirmed"]
    full_text_url: str | None
    record_url: str
    retrieved_at: datetime
    cache_scope: str


class EvidenceProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile_id: str
    retrieval_status: Literal["cached"] = "cached"
    experiment: ExperimentConfig
    literature: list[CachedSourceRecord]
    structure: StructureReference


def load_curated_profile(path: Path | None = None) -> CuratedProfile:
    file = path or DATA_ROOT / "drugs/trastuzumab.json"
    return CuratedProfile.model_validate_json(file.read_text())


def validate_literature_identity(record: CachedSourceRecord | LiteratureRecord, check: LiteratureCheck) -> None:
    if record.pmid != check.pmid or record.pmcid != check.pmcid or record.doi != check.doi:
        raise ValueError(f"Europe PMC identifiers do not match reviewed source {check.source_id}")
    if record.provider_source != "MED" or record.provider_id != check.pmid:
        raise ValueError(f"Europe PMC source identity does not match {check.source_id}")
    title = record.title.lower()
    if any(term.lower() not in title for term in check.title_terms):
        raise ValueError(f"Europe PMC title context does not match {check.source_id}")


def load_cached_record(check: LiteratureCheck, cache_root: Path | None = None) -> CachedSourceRecord:
    file = (cache_root or DATA_ROOT / "research/cache") / f"{check.pmid}.json"
    record = CachedSourceRecord.model_validate(json.loads(file.read_text()))
    if record.source_id != check.source_id:
        raise ValueError("Cached record is attached to the wrong reviewed source")
    validate_literature_identity(record, check)
    return record


def load_evidence_profile(path: Path | None = None, cache_root: Path | None = None) -> EvidenceProfile:
    profile = load_curated_profile(path)
    return EvidenceProfile(
        profile_id=profile.profile_id, experiment=profile.experiment,
        literature=[load_cached_record(check, cache_root) for check in profile.literature_checks],
        structure=profile.structure,
    )
