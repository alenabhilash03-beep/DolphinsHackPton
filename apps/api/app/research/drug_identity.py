"""Drug identity and deterministic model eligibility; never configures or runs a simulation."""
from datetime import date
import json
from pathlib import Path
from typing import Literal, get_args
from pydantic import Field, model_validator
from app.research.chembl import API, ChEMBLIdentityClient, IdentityMismatch, IdentityUnavailable, normalized
from app.research.registry import DATA_ROOT, CuratedProfile, load_curated_profile
from app.schemas.contracts import Contract, ControlAdjustment, SupportAssessment
from app.schemas.drug_support import DrugAssessmentRequest, DrugAssessmentResponse, DrugIdentity, ModelCapability
from app.simulation.registry import MAX_EVENTS_PER_SCENARIO, MAX_HORIZON_H

class CatalogEntry(Contract):
    profile_id: str
    profile_version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    profile_file: str = Field(pattern=r"^[a-z0-9_-]+\.json$")
    canonical_name: str
    molecule_type: str
    chembl_id: str = Field(pattern=r"^CHEMBL[1-9]\d*$")
    identity_checked_on: date
    target_identifiers: dict[str, str]
    target_aliases: list[str] = Field(min_length=1)
    form_aliases: list[str] = Field(min_length=1)

class ProfileCatalog(Contract):
    schema_version: Literal["1.0"]
    profiles: list[CatalogEntry]

    @model_validator(mode="after")
    def unique_profiles(self):
        if len({item.profile_id for item in self.profiles}) != len(self.profiles):
            raise ValueError("Catalog profile identifiers must be unique")
        return self

def load_profile_catalog(path: Path | None = None) -> list[tuple[CatalogEntry, CuratedProfile]]:
    catalog = ProfileCatalog.model_validate_json((path or DATA_ROOT / "drugs/catalog.json").read_text())
    result = []
    for entry in catalog.profiles:
        profile = load_curated_profile(DATA_ROOT / "drugs" / entry.profile_file)
        if entry.profile_id != profile.profile_id or normalized(entry.canonical_name) not in {normalized(item) for item in profile.aliases}:
            raise ValueError("Identity catalog does not match its reviewed profile")
        if normalized(profile.drug_form) not in {normalized(item) for item in entry.form_aliases} or normalized(profile.target) not in {normalized(item) for item in entry.target_aliases}:
            raise ValueError("Catalog must retain the reviewed molecular form and target")
        if normalized(entry.target_identifiers.get("gene_symbol", "")) not in {normalized(item) for item in entry.target_aliases}:
            raise ValueError("Catalog target identifier must be a reviewed target alias")
        result.append((entry, profile))
    return result

def _registered_identity(entry: CatalogEntry, profile: CuratedProfile) -> DrugIdentity:
    return DrugIdentity(canonical_name=entry.canonical_name,
        identifiers={"chembl_id":entry.chembl_id,"profile_id":entry.profile_id}, aliases=profile.aliases,
        molecular_form=profile.drug_form, molecule_type=entry.molecule_type, provenance="reviewed_registry",
        source_url=f"{API}/molecule/{entry.chembl_id}.json", identity_checked_on=entry.identity_checked_on,
        form_scope="Identity is tied to this reviewed intact-antibody profile; its scientific inputs have separate cited provenance.")

class DrugAssessmentService:
    def __init__(self, identity_client: ChEMBLIdentityClient | None = None):
        self.identity_client = identity_client or ChEMBLIdentityClient()

    def assess(self, request: DrugAssessmentRequest) -> DrugAssessmentResponse:
        matches = [(entry, profile) for entry, profile in load_profile_catalog()
                   if normalized(request.drug_name) in {normalized(item) for item in [entry.chembl_id, *profile.aliases]}]
        notes = ["This assessment checks structured identity, target, form, route and endpoint only. A validated experiment configuration is still required."]
        if request.original_hypothesis:
            notes.append("The original hypothesis is preserved but its natural-language interventions have not been parsed or approved by this 7A assessment.")
        if len(matches) > 1:
            return DrugAssessmentResponse(request=request, identity_status="ambiguous", retrieval_status="reviewed_registry",
                candidates=[_registered_identity(*item) for item in matches][:5], notes=notes,
                ambiguities=["More than one reviewed molecular profile matches; specify target and form."],
                support=SupportAssessment(status="needs_parameters", reasons=["Reviewed identity is ambiguous."], missing_parameters=["drug molecular form and target"]))
        if matches:
            return self._reviewed(request, *matches[0], notes)
        try:
            lookup = self.identity_client.lookup(request.drug_name)
        except (IdentityUnavailable, IdentityMismatch):
            return DrugAssessmentResponse(request=request, identity_status="unavailable", retrieval_status="unavailable", notes=notes,
                support=SupportAssessment(status="needs_parameters", reasons=["Identity provider or its cached record is unavailable or invalid; no identity or model was inferred."],
                                          missing_parameters=["verified drug identity", "reviewed drug-target model profile"]))
        candidates = lookup.candidates
        if not candidates and lookup.complete:
            return DrugAssessmentResponse(request=request, identity_status="not_found", retrieval_status=lookup.retrieval_status, notes=notes,
                support=SupportAssessment(status="needs_parameters", reasons=["No exact name or alias match was returned. This does not establish that the drug or literature does not exist."],
                                          missing_parameters=["unambiguous drug name or database identifier", "reviewed drug-target model profile"]))
        if len(candidates) > 1 and request.molecular_form and lookup.complete:
            filtered = [item for item in candidates if normalized(request.molecular_form) == normalized(item.canonical_name)]
            if len(filtered) == 1:
                candidates = filtered
        if len(candidates) != 1 or not lookup.complete:
            return DrugAssessmentResponse(request=request, identity_status="ambiguous", retrieval_status=lookup.retrieval_status,
                candidates=candidates, notes=notes, ambiguities=["Multiple records or molecular forms match; specify an exact preferred name or ChEMBL identifier. Truncated result pages are not resolved automatically."],
                support=SupportAssessment(status="needs_parameters", reasons=["The submitted name does not identify one verified molecular record."], missing_parameters=["unambiguous molecular identity/form"]))
        if request.molecular_form and normalized(request.molecular_form) != normalized(candidates[0].canonical_name):
            return DrugAssessmentResponse(request=request, identity_status="ambiguous", retrieval_status=lookup.retrieval_status,
                candidates=candidates, notes=notes, ambiguities=["The requested form does not match the exact database preferred record name; no salt or formulation was substituted."],
                support=SupportAssessment(status="needs_parameters", reasons=["The requested molecular form needs an unambiguous database record."], missing_parameters=["exact molecular-form name or identifier"]))
        return DrugAssessmentResponse(request=request, identity_status="candidate_identity", retrieval_status=lookup.retrieval_status,
            resolved_identity=candidates[0], candidates=candidates, notes=notes,
            support=SupportAssessment(status="needs_parameters", reasons=["A database identity was found, but Hypothesim has no reviewed drug-target model profile for this name. Identity and brand matching alone do not validate simulation."],
                missing_parameters=["reviewed drug-target and molecular-form applicability", "reviewed PK/administration inputs and units",
                                    "reviewed binding-rate pair or separately approved binding model", "target-site exposure assumptions", "route and endpoint model suitability"]))

    def _reviewed(self, request: DrugAssessmentRequest, entry: CatalogEntry, profile: CuratedProfile, notes: list[str]) -> DrugAssessmentResponse:
        identity = _registered_identity(entry, profile)
        defaults = {}
        reasons, missing, ambiguities = [], [], []
        capability = ModelCapability(model_id=profile.model_id, supported_routes=["iv_infusion"], supported_endpoints=["target_occupancy"],
            adjustable_fields=list(get_args(ControlAdjustment.model_fields["field"].annotation)), maximum_duration_h=MAX_HORIZON_H,
            maximum_events_per_scenario=MAX_EVENTS_PER_SCENARIO,
            limitations=profile.experiment.limitations + profile.experiment.support.reasons)
        if request.target is None: defaults["target"] = profile.target
        elif normalized(request.target) not in {normalized(item) for item in entry.target_aliases}:
            reasons.append("Requested target is outside the reviewed HER2 extracellular effective-site profile.")
        if request.molecular_form is None: defaults["molecular_form"] = profile.drug_form
        elif normalized(request.molecular_form) not in {normalized(item) for item in entry.form_aliases}:
            reasons.append("Requested molecular form does not match the reviewed intact trastuzumab IgG1 profile; Fab kinetics cannot be substituted automatically.")
        if request.route is None: defaults["route"] = "iv_infusion"
        elif normalized(request.route) in {"iv", "intravenous"}:
            missing.append("explicit IV infusion versus hypothetical bolus route")
            ambiguities.append("IV alone does not specify the administration input model.")
        elif normalized(request.route) not in {"iv_infusion", "iv infusion", "intravenous infusion"}:
            reasons.append("Requested route is outside this reviewed IV-infusion profile. A hypothetical bolus requires a separate explicit custom configuration.")
        if request.endpoint is None: defaults["endpoint"] = "target_occupancy"
        elif normalized(request.endpoint) not in {"target_occupancy", "target occupancy", "occupancy"}:
            reasons.append("This model's endpoint is target occupancy; it cannot predict efficacy, toxicity or clinical outcomes.")
        status = "unsupported" if reasons else "needs_parameters" if missing else "conditional"
        support = SupportAssessment(status=status, reasons=reasons or (["Administration needs clarification."] if missing else profile.experiment.support.reasons), missing_parameters=missing)
        return DrugAssessmentResponse(request=request, identity_status="reviewed_identity", retrieval_status="reviewed_registry",
            resolved_identity=identity, candidates=[identity], profile_id=entry.profile_id, profile_version=entry.profile_version,
            resolved_target=profile.target, target_identifiers=entry.target_identifiers, support=support, model_eligible=status == "conditional", capabilities=[capability],
            defaults_applied=defaults, ambiguities=ambiguities, notes=notes)
