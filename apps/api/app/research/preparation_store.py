"""SQLite revisions and immutable configuration receipts; no agent dependency."""
from contextlib import contextmanager
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from app.schemas.preparation_workflow import PreparationRecord
from app.schemas.contracts import ExperimentConfig


def canonical_hash(value: object) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()).hexdigest()


class StalePreparation(ValueError):
    pass


class PreparationStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS preparation_revisions (id TEXT, revision INTEGER, digest TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(id,revision))')
            db.execute('CREATE TABLE IF NOT EXISTS prepared_configuration_parents (child_digest TEXT PRIMARY KEY, parent_digest TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS prepared_configurations (digest TEXT PRIMARY KEY, preparation_id TEXT NOT NULL, revision INTEGER NOT NULL, evidence_digest TEXT NOT NULL, config TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=5)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def read(self, preparation_id: str, revision: int | None = None) -> PreparationRecord:
        with self.connect() as db:
            if revision is None:
                row = db.execute('SELECT record FROM preparation_revisions WHERE id=? ORDER BY revision DESC LIMIT 1', (preparation_id,)).fetchone()
            else:
                row = db.execute('SELECT record FROM preparation_revisions WHERE id=? AND revision=?', (preparation_id, revision)).fetchone()
        if row is None:
            raise KeyError('Preparation not found')
        return PreparationRecord.model_validate_json(row[0])

    def save(self, record: PreparationRecord, expected_revision: int | None = None, expected_digest: str | None = None):
        self.save_chain([record], expected_revision, expected_digest)

    def save_chain(self, records: list[PreparationRecord], expected_revision: int | None, expected_digest: str | None):
        first = records[0].preparation
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision,digest FROM preparation_revisions WHERE id=? ORDER BY revision DESC LIMIT 1', (first.preparation_id,)).fetchone()
            if expected_revision is None:
                if row is not None or first.revision != 0:
                    raise StalePreparation('Preparation already exists')
            elif row != (expected_revision, expected_digest) or first.revision != expected_revision + 1:
                raise StalePreparation('Preparation changed; reload its current revision and evidence hash')
            next_revision = first.revision
            for record in records:
                prep = record.preparation
                if prep.preparation_id != first.preparation_id or prep.revision != next_revision:
                    raise ValueError('Preparation history requires consecutive matching revisions')
                db.execute('INSERT INTO preparation_revisions VALUES (?,?,?,?)', (prep.preparation_id, prep.revision, prep.evidence_sha256, record.model_dump_json()))
                next_revision += 1

    def register_configuration(self, record: PreparationRecord, experiment: ExperimentConfig) -> str:
        digest = canonical_hash(experiment.model_dump(mode='json'))
        prep = record.preparation
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision,digest FROM preparation_revisions WHERE id=? ORDER BY revision DESC LIMIT 1', (prep.preparation_id,)).fetchone()
            if row != (prep.revision, prep.evidence_sha256):
                raise StalePreparation('Preparation changed before configuration')
            db.execute('INSERT OR IGNORE INTO prepared_configurations VALUES (?,?,?,?,?)',
                (digest, prep.preparation_id, prep.revision, prep.evidence_sha256, experiment.model_dump_json()))
        return digest

    def require_configuration(self, experiment: ExperimentConfig) -> None:
        digest = canonical_hash(experiment.model_dump(mode='json'))
        with self.connect() as db:
            row = db.execute('SELECT config FROM prepared_configurations WHERE digest=?', (digest,)).fetchone()
        if row is None or ExperimentConfig.model_validate_json(row[0]) != experiment:
            raise ValueError('Research-derived configuration has no matching server validation receipt; prepare it first')

    def register_control_configuration(self, parent: ExperimentConfig, experiment: ExperimentConfig):
        """Only the deterministic control service calls this after validating its edit."""
        self.require_configuration(parent)
        parent_digest = canonical_hash(parent.model_dump(mode='json'))
        digest = canonical_hash(experiment.model_dump(mode='json'))
        with self.connect() as db:
            row = db.execute('SELECT preparation_id,revision,evidence_digest FROM prepared_configurations WHERE digest=?', (parent_digest,)).fetchone()
            if row is None or experiment.mode != 'research_derived':
                raise ValueError('Control derivation requires a registered research configuration')
            db.execute('INSERT OR IGNORE INTO prepared_configurations VALUES (?,?,?,?,?)', (digest,*row,experiment.model_dump_json()))
            db.execute('INSERT OR IGNORE INTO prepared_configuration_parents VALUES (?,?)', (digest,parent_digest))
