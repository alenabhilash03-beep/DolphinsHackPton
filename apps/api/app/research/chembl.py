"""Bounded exact identity lookup. Molecule metadata never supplies simulation parameters."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Callable, Literal
from uuid import uuid4
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from pydantic import Field, model_validator
from app.config import ROOT
from app.schemas.contracts import Contract
from app.schemas.drug_support import DrugIdentity

API = "https://www.ebi.ac.uk/chembl/api/data"
MAX_BYTES = 1_000_000

def normalized(value: str) -> str:
    # Preserve punctuation, salt suffixes and molecular-form distinctions.
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())

class IdentityUnavailable(RuntimeError):
    pass

class IdentityMismatch(ValueError):
    pass

class IdentityLookup(Contract):
    query: str
    retrieval_status: Literal["live", "cached_degraded"] = "live"
    retrieved_at: datetime
    total_matches: int = Field(ge=0)
    candidates: list[DrugIdentity] = Field(max_length=5)
    complete: bool

    @model_validator(mode="after")
    def identity_integrity(self):
        ids = [item.identifiers.get("chembl_id") for item in self.candidates]
        if len(set(ids)) != len(ids) or self.total_matches < len(ids):
            raise ValueError("Identity candidates must have distinct, consistent identifiers")
        for item in self.candidates:
            key = item.identifiers.get("chembl_id", "")
            if not re.fullmatch(r"CHEMBL[1-9]\d*", key) or str(item.source_url) != f"{API}/molecule/{key}.json":
                raise ValueError("Identity record does not match its ChEMBL source")
            if item.provenance != "database_candidate" or item.retrieved_at != self.retrieved_at:
                raise ValueError("Retrieved identity must retain candidate status and retrieval time")
            names = [item.canonical_name, *item.aliases, key]
            if normalized(self.query) not in {normalized(name) for name in names}:
                raise ValueError("Identity candidate does not match the exact requested name or alias")
        if self.complete != (self.total_matches == len(ids)):
            raise ValueError("Identity completeness must agree with the provider match count")
        return self

def _fetch(url: str) -> bytes:
    with urlopen(Request(url, headers={"Accept": "application/json", "User-Agent": "Hypothesim/0.1 identity-client"}), timeout=4) as response:
        body = response.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise IdentityUnavailable("Identity response exceeds the bounded payload size")
    return body

class ChEMBLIdentityClient:
    def __init__(self, fetch: Callable[[str], bytes] = _fetch, cache_dir: Path | None = None,
                 seed_dir: Path | None = None):
        self.fetch = fetch
        self.cache_dir = cache_dir or ROOT / "work/identity-cache"
        self.seed_dir = seed_dir or ROOT / "data/research/identity-cache"

    def _json(self, url: str):
        try:
            body = self.fetch(url)
            if len(body) > MAX_BYTES:
                raise IdentityUnavailable("Identity response too large")
            return json.loads(body)
        except HTTPError as exc:
            if exc.code == 404 and re.search(r"/molecule/CHEMBL[1-9]\d*\.json$", url):
                return None
            raise IdentityUnavailable("ChEMBL identity lookup unavailable") from exc
        except (URLError, OSError, TimeoutError, json.JSONDecodeError) as exc:
            raise IdentityUnavailable("ChEMBL identity lookup unavailable") from exc

    def _parse(self, raw: dict, query: str, now: datetime) -> DrugIdentity:
        try:
            key, name = raw["molecule_chembl_id"], raw["pref_name"]
            if not isinstance(key, str) or not re.fullmatch(r"CHEMBL[1-9]\d*", key) or not isinstance(name, str) or not name.strip():
                raise ValueError("Invalid identity")
            aliases = sorted({item["molecule_synonym"].strip() for item in (raw.get("molecule_synonyms") or [])
                              if isinstance(item, dict) and isinstance(item.get("molecule_synonym"), str) and item["molecule_synonym"].strip()})
            # Keep the matching alias even when a record has many synonyms.
            aliases = [item for item in aliases if normalized(item) == normalized(query)] + [item for item in aliases if normalized(item) != normalized(query)]
            return DrugIdentity(canonical_name=name.strip(), identifiers={"chembl_id": key}, aliases=aliases[:100],
                                molecular_form=name.strip(), molecule_type=raw.get("molecule_type"),
                                parent_identifier=(raw.get("molecule_hierarchy") or {}).get("parent_chembl_id"),
                                provenance="database_candidate", source_url=f"{API}/molecule/{key}.json", retrieved_at=now,
                                form_scope="Database preferred record name; formulation, protonation, target and model applicability are not independently established.")
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise IdentityMismatch("ChEMBL returned an invalid identity record") from exc

    def _online(self, query: str) -> IdentityLookup:
        now = datetime.now(timezone.utc)
        if re.fullmatch(r"CHEMBL[1-9]\d*", query.upper()):
            raw = self._json(f"{API}/molecule/{query.upper()}.json")
            candidates = [self._parse(raw, query, now)] if raw is not None else []
            count = len(candidates)
        else:
            candidates, count = [], 0
            for field in ("pref_name__iexact", "molecule_synonyms__molecule_synonym__iexact"):
                payload = self._json(f"{API}/molecule.json?" + urlencode({field: query, "limit": 5}))
                try:
                    rows = payload["molecules"]
                    count = int(payload["page_meta"]["total_count"])
                    if not isinstance(rows, list) or len(rows) > 5 or count < len(rows):
                        raise ValueError("Invalid result page")
                    candidates = list({item.identifiers["chembl_id"]: item for item in [self._parse(raw, query, now) for raw in rows]}.values())
                    if field == "pref_name__iexact" and any(normalized(item.canonical_name) != query for item in candidates):
                        raise IdentityMismatch("Preferred-name lookup returned a different drug")
                except (KeyError, TypeError, ValueError) as exc:
                    raise IdentityMismatch("ChEMBL identity page did not match the request") from exc
                # An exact preferred record name is more specific than a brand alias.
                if count:
                    break
        try:
            return IdentityLookup(query=query, retrieved_at=now, total_matches=count, candidates=candidates,
                                  complete=count == len(candidates))
        except ValueError as exc:
            raise IdentityMismatch("ChEMBL identity does not match the exact query") from exc

    def lookup(self, name: str) -> IdentityLookup:
        query = normalized(name)
        if not query or len(query) > 200:
            raise ValueError("Drug identity requires a name of at most 200 characters")
        filename = sha256(query.encode()).hexdigest() + ".json"
        try:
            result = self._online(query)
        except IdentityUnavailable:
            for directory in (self.cache_dir, self.seed_dir):
                path = directory / filename
                if path.exists():
                    try:
                        if path.stat().st_size > MAX_BYTES:
                            raise ValueError("Cache too large")
                        cached = IdentityLookup.model_validate_json(path.read_text())
                        if cached.query != query:
                            raise ValueError("Cached query mismatch")
                    except (OSError, ValueError) as exc:
                        raise IdentityMismatch("Cached identity is invalid; no candidate was accepted") from exc
                    return cached.model_copy(update={"retrieval_status": "cached_degraded"})
            raise
        if result.candidates:
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                temporary = self.cache_dir / (filename + "." + uuid4().hex + ".tmp")
                temporary.write_text(result.model_dump_json(indent=2) + "\n")
                temporary.replace(self.cache_dir / filename)
            except OSError:
                pass  # Cache availability is not scientific approval.
        return result
