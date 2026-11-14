"""Europe PMC core search; returns literature metadata, never model parameters."""

from datetime import datetime, timezone
from html import unescape
import json
import re
from typing import Callable, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pydantic import BaseModel, ConfigDict

SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
MAX_RESPONSE_BYTES = 2_000_000


class RetrievalError(RuntimeError):
    """The provider failed or returned data that cannot be trusted."""


class SourceMismatchError(RetrievalError):
    """A provider response does not identify the exact requested publication."""


class LiteratureRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["Europe PMC"] = "Europe PMC"
    provider_source: str
    provider_id: str
    title: str
    pmid: str | None = None
    pmcid: str | None = None
    doi: str | None = None
    publication_year: str | None = None
    abstract: str | None = None
    abstract_available: bool
    full_text_status: Literal["open_access_link", "not_confirmed"]
    full_text_url: str | None = None
    record_url: str
    retrieved_at: datetime


class LiteratureSearch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str
    provider: Literal["Europe PMC"] = "Europe PMC"
    retrieval_status: Literal["live"] = "live"
    hit_count: int
    records: list[LiteratureRecord]
    retrieved_at: datetime


def _clean_text(value: str | None) -> str:
    return " ".join(unescape(re.sub(r"<[^>]+>", " ", value or "")).split())


def parse_core_record(raw: dict, retrieved_at: datetime) -> LiteratureRecord:
    """Parse only source metadata; a missing abstract or OA link remains missing."""
    if not isinstance(raw, dict) or not raw.get("id") or not raw.get("source") or not raw.get("title"):
        raise RetrievalError("Europe PMC returned an incomplete literature record")
    title = _clean_text(raw["title"])
    if not title:
        raise RetrievalError("Europe PMC returned a literature record without a usable title")
    urls = raw.get("fullTextUrlList", {}).get("fullTextUrl", [])
    if not isinstance(urls, list):
        urls = []
    open_url = next((item.get("url") for item in urls if isinstance(item, dict)
                     and item.get("availabilityCode") == "OA" and item.get("documentStyle") == "html"
                     and isinstance(item.get("url"), str)), None)
    abstract = _clean_text(raw.get("abstractText")) or None
    source = str(raw["source"])
    identifier = str(raw["id"])
    return LiteratureRecord(
        provider_source=source, provider_id=identifier, title=title,
        pmid=raw.get("pmid"), pmcid=raw.get("pmcid"), doi=raw.get("doi"),
        publication_year=raw.get("pubYear"), abstract=abstract,
        abstract_available=abstract is not None,
        full_text_status="open_access_link" if open_url else "not_confirmed",
        full_text_url=open_url,
        record_url=f"https://europepmc.org/article/{source}/{identifier}",
        retrieved_at=retrieved_at,
    )


def _fetch(url: str) -> bytes:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "Hypothesim/0.1 research-client"})
    with urlopen(request, timeout=7) as response:
        body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise RetrievalError("Europe PMC response exceeds the configured limit")
    return body


class EuropePMCClient:
    def __init__(self, fetch: Callable[[str], bytes] = _fetch):
        self.fetch = fetch

    def search(self, query: str, *, page_size: int = 5) -> LiteratureSearch:
        query = query.strip()
        if not query or len(query) > 500 or not 1 <= page_size <= 10:
            raise ValueError("Search requires a query of at most 500 characters and 1–10 results")
        url = SEARCH_URL + "?" + urlencode({"query": query, "format": "json", "resultType": "core", "pageSize": page_size})
        try:
            payload = json.loads(self.fetch(url))
            raw_results = payload["resultList"]["result"]
            if not isinstance(raw_results, list):
                raise TypeError("Expected a result list")
            now = datetime.now(timezone.utc)
            return LiteratureSearch(query=query, hit_count=int(payload.get("hitCount", len(raw_results))),
                                    records=[parse_core_record(item, now) for item in raw_results], retrieved_at=now)
        except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            raise RetrievalError("Europe PMC search is unavailable or returned an invalid response") from exc

    def lookup_pmid(self, pmid: str) -> LiteratureRecord:
        if not re.fullmatch(r"[0-9]{6,10}", pmid):
            raise ValueError("A PubMed identifier must contain 6–10 digits")
        result = self.search(f"EXT_ID:{pmid} AND SRC:MED", page_size=3)
        matches = [record for record in result.records if record.provider_source == "MED" and record.pmid == pmid]
        if len(matches) != 1:
            raise SourceMismatchError("Europe PMC did not return the exact requested PubMed record")
        return matches[0]
