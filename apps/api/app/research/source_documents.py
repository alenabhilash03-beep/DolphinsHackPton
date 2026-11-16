"""Bounded Europe PMC source retrieval; no arbitrary URLs or executable source content."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, HTTPRedirectHandler, build_opener
from uuid import uuid4
from xml.etree import ElementTree as ET

from app.research.europe_pmc import EuropePMCClient, LiteratureRecord, RetrievalError, SourceMismatchError
from app.schemas.evidence_extraction import EvidenceSegment, EvidenceSnapshot, SourceRetrievalResult
from app.schemas.experiment_preparation import PreparationSource

FULL_TEXT_ROOT = "https://www.ebi.ac.uk/europepmc/webservices/rest/"
MAX_XML_BYTES = 2_000_000
MAX_DOCUMENT_CHARS = 24_000


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_full_text(url: str) -> bytes:
    if not re.fullmatch(re.escape(FULL_TEXT_ROOT) + r"PMC[0-9]{1,12}/fullTextXML", url):
        raise RetrievalError("Only the fixed Europe PMC full-text endpoint is permitted")
    with build_opener(_NoRedirect).open(Request(url, headers={"Accept": "application/xml", "User-Agent": "Hypothesim/0.1 evidence-client"}), timeout=15) as response:
        data = response.read(MAX_XML_BYTES + 1)
    if len(data) > MAX_XML_BYTES:
        raise RetrievalError("Source response exceeds the XML byte limit")
    return data


def _text(element) -> str:
    return " ".join(" ".join(element.itertext()).split())


PARAMETER_TERMS = re.compile(r'\b(?:clearance|CL|volume|Vc|V1|V_?ss|half[- ]?life|t1/2|t½|elimination|K_?D|dissociation constant|affinity|'
    r'k_?on|k_?off|association rate|dissociation rate|binding kinetic|surface plasmon|SPR|BLI|Biacore|population pharmacokinetic|'
    r'two-compartment|one-compartment|parameter estimate)', re.I)
UNIT_TERMS = re.compile(r'(?:\bL/(?:h|day|d)\b|\bmL/(?:h|min|day|d)\b|\bL\b|\bdays?\b|\bh(?:ours?)?\b|[nmpµμ]M\b|M[-−]1\s*s[-−]1|s[-−]1|1/Ms|1/s)')


def relevance(text: str, table: bool = False) -> int:
    """How strongly a text block reports model inputs: parameter terms with numbers and units score highest."""
    terms = len(PARAMETER_TERMS.findall(text))
    if not terms:
        return 1 if table else 0
    return 2 + min(terms, 4) * 2 + (3 if re.search(r'\d', text) and UNIT_TERMS.search(text) else 0) + (2 if table else 0)


def snapshot_digest(document: EvidenceSnapshot) -> str:
    payload = document.model_dump(mode="json")
    payload['source'].pop('snapshot_sha256', None)
    payload.pop('original_snapshot_sha256', None)
    return sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def _segments(texts: list[tuple[str, str]]) -> tuple[list[EvidenceSegment], bool]:
    result = []
    consumed = 0
    truncated = False
    for label, text in texts:
        # Bound each chunk and the total. Never silently imply the entire article was inspected.
        for start in range(0, len(text), 1800):
            if len(result) >= 32 or consumed >= MAX_DOCUMENT_CHARS:
                return result, True
            chunk = text[start:start + min(1800, MAX_DOCUMENT_CHARS - consumed)]
            if chunk.strip():
                result.append(EvidenceSegment(locator=f'{label}:{start}', text=chunk))
                consumed += len(chunk)
                truncated = truncated or start + len(chunk) < min(start + 1800, len(text))
    return result, truncated


class SourceDocumentService:
    def __init__(self, literature: EuropePMCClient | None = None,
                 fetch: Callable[[str], bytes] = fetch_full_text, cache_dir: Path | None = None):
        self.literature = literature or EuropePMCClient()
        self.fetch = fetch
        self.cache_dir = cache_dir
        self.records: dict[str, LiteratureRecord] = {}
        self.documents: dict[str, EvidenceSnapshot] = {}

    def register(self, record: LiteratureRecord) -> str:
        if len(self.records) >= 20:
            raise ValueError("Evidence session source limit reached")
        handle = uuid4().hex
        # Handles bind source selection to metadata this service actually retrieved.
        self.records[handle] = record.model_copy(deep=True)
        return handle

    def retrieve(self, handle: str, start_block: int = 0) -> SourceRetrievalResult:
        if not isinstance(start_block, int) or isinstance(start_block, bool) or not 0 <= start_block <= 10_000:
            raise ValueError('Source page offset must be an integer from 0 to 10000')
        next_start_block = None
        record = self.records.get(handle)
        if record is None:
            return SourceRetrievalResult(status='rejected', reasons=['Unknown session source handle; search first.'])
        if len(self.documents) >= 20:
            return SourceRetrievalResult(status='rejected', reasons=['Evidence session document limit reached.'])
        warnings = []
        segments = []
        kind = 'abstract'
        url = record.record_url
        now = record.retrieved_at
        if record.pmcid and re.fullmatch(r'PMC[0-9]{1,12}', record.pmcid):
            try:
                url = FULL_TEXT_ROOT + record.pmcid + '/fullTextXML'
                body = self.fetch(url)
                if len(body) > MAX_XML_BYTES:
                    raise RetrievalError('Source response exceeds the XML byte limit')
                # ElementTree does not fetch external DTDs. Permit standard JATS declarations,
                # but reject internal subsets and entity definitions before parsing.
                if b'<!ENTITY' in body.upper() or re.search(br'<!DOCTYPE[^>]*\[', body, re.I):
                    raise RetrievalError('Internal DTD/entity source documents are not accepted')
                root = ET.fromstring(body)
                # Normalize namespace tags, then restrict identity to the article's own metadata.
                for element in root.iter():
                    element.tag = element.tag.rsplit('}', 1)[-1]
                if root.tag != 'article':
                    raise RetrievalError('Full-text response is not an article')
                ids = {}
                for element in root.findall('./front/article-meta/article-id'):
                    ids.setdefault(element.get('pub-id-type'), []).append(_text(element))
                pmc_ids = [value.removeprefix('PMC') for key in ('pmc', 'pmcid') for value in ids.get(key, [])]
                if set(pmc_ids) != {record.pmcid.removeprefix('PMC')}:
                    raise SourceMismatchError('Full-text identity does not match the requested PMCID')
                if record.pmid and ids.get('pmid') and set(ids['pmid']) != {record.pmid}:
                    raise SourceMismatchError('Full-text PMID conflicts with the retrieved record')
                if record.doi and ids.get('doi') and {value.casefold() for value in ids['doi']} != {record.doi.casefold()}:
                    raise SourceMismatchError('Full-text DOI conflicts with the retrieved record')
                blocks = []
                table_locators = set()
                table_context = {}
                for wrapper in root.findall('.//table-wrap'):
                    caption = wrapper.find('caption')
                    headers = [_text(e) for e in wrapper.findall('.//thead')]
                    headers.extend(_text(e) for e in wrapper.findall('./table-wrap-foot'))
                    context = ' '.join(([ _text(caption)] if caption is not None else []) + headers)
                    for row in wrapper.findall('.//tr'):
                        table_context[id(row)] = context
                for region in (root.find('./front/article-meta/abstract'), root.find('body'), root.find('floats-group')):
                    if region is not None:
                        # Keep paragraphs and table rows separate and addressable; omit references.
                        for element in region.iter():
                            if element.tag in {'p', 'tr'} and _text(element):
                                text = ' '.join(filter(None, [table_context.get(id(element), ''), _text(element)]))
                                locator = f'full_text:block-{len(blocks) + 1}'
                                blocks.append((locator, text))
                                if element.tag == 'tr':
                                    table_locators.add(locator)
                # Most relevant first while keeping stable source-block locators: passages naming model inputs
                # (clearance, volume, half-life, KD, kon/koff) with values and units lead; then other tables; then prose.
                order = {locator: index for index, (locator, _) in enumerate(blocks)}
                blocks = sorted(blocks, key=lambda item: (-relevance(item[1], item[0] in table_locators), order[item[0]]))
                if not blocks:
                    raise RetrievalError('No supported text blocks in full-text response')
                if start_block >= len(blocks):
                    return SourceRetrievalResult(status='rejected', reasons=['Source page offset is outside the available text blocks.'])
                page_end = min(start_block + 12, len(blocks))
                segments, truncated = _segments(blocks[start_block:page_end])
                next_offset = start_block + 1 if truncated else page_end
                next_start_block = next_offset if next_offset < len(blocks) else None
                if not segments:
                    raise RetrievalError('No supported text blocks in full-text response')
                if truncated or next_start_block is not None:
                    warnings.append('Partial bounded full-text page; unreturned text was not inspected. Use the next block offset when available.')
                warnings.append('Table rows include available caption/header context as normalized text; column meaning must be checked before use.')
                kind = 'full_text'
                now = datetime.now(timezone.utc)
            except SourceMismatchError:
                return SourceRetrievalResult(status='rejected', reasons=['Full-text identity mismatch; no extraction permitted.'])
            except (HTTPError, URLError, TimeoutError, OSError, ET.ParseError, RetrievalError):
                warnings.append('Full text unavailable or unusable; only the retrieved abstract can be inspected.')
        else:
            warnings.append('No usable PMCID; only the retrieved abstract can be inspected.')
        if not segments:
            if start_block:
                return SourceRetrievalResult(status='unavailable', reasons=[*warnings, 'Requested full-text page unavailable; no abstract substitution at this offset.'])
            if not record.abstract:
                return SourceRetrievalResult(status='unavailable', reasons=[*warnings, 'No accessible abstract or usable full text.'])
            segments, truncated = _segments([('abstract', record.abstract)])
            if truncated:
                warnings.append('Abstract truncated to the bounded snapshot.')
            url = record.record_url
        document_id = uuid4().hex
        document = EvidenceSnapshot(
            document_id=document_id,
            source=PreparationSource(source_id=f'epmc-{document_id}', url=url, title=record.title,
                retrieved_at=now, retrieval_status='live', content_kind=kind,
                identifiers={k: v for k, v in {'pmid': record.pmid, 'pmcid': record.pmcid, 'doi': record.doi}.items() if v}),
            segments=segments, warnings=warnings,
        )
        document.source.snapshot_sha256 = snapshot_digest(document)
        self.documents[document.document_id] = document.model_copy(deep=True)
        if self.cache_dir:
            try:
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                (self.cache_dir / f'{document.document_id}.json').write_text(document.model_dump_json(indent=2))
            except OSError:
                document.warnings.append('Snapshot persistence failed; session snapshot remains available.')
                document.source.snapshot_sha256 = snapshot_digest(document)
                self.documents[document.document_id] = document.model_copy(deep=True)
        return SourceRetrievalResult(status='retrieved', document=document, next_start_block=next_start_block)

    def get(self, document_id: str) -> EvidenceSnapshot:
        document = self.documents.get(document_id)
        if document is None or snapshot_digest(document) != document.source.snapshot_sha256:
            raise ValueError('Unknown or corrupted session evidence snapshot')
        return document.model_copy(deep=True)

    def restore(self, document_id: str) -> EvidenceSnapshot:
        """Explicit cache load for controlled replay; never a silent live-source fallback."""
        if not self.cache_dir or not re.fullmatch('[a-f0-9]{32}', document_id):
            raise ValueError('Invalid cache document handle')
        try:
            path = self.cache_dir / f'{document_id}.json'
            if path.stat().st_size > 250_000:
                raise ValueError('Cached snapshot exceeds limit')
            document = EvidenceSnapshot.model_validate_json(path.read_text())
            if document.document_id != document_id or snapshot_digest(document) != document.source.snapshot_sha256:
                raise ValueError('Cached snapshot integrity mismatch')
        except (OSError, ValueError) as exc:
            raise ValueError('Cached snapshot unavailable or invalid') from exc
        # Set from the verified file, never from a cached claim about its own origin.
        document.original_snapshot_sha256 = document.source.snapshot_sha256
        document.source.retrieval_status = 'cached'
        document.warnings.append('Explicit cached replay; original retrieval time retained.')
        document.source.snapshot_sha256 = snapshot_digest(document)
        if len(self.documents) >= 20:
            raise ValueError('Evidence session document limit reached')
        self.documents[document_id] = document.model_copy(deep=True)
        return document
