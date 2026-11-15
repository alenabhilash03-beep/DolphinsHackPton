"""Durable turns and an immutable tree of results.

A result is never changed after it is stored. By default a result accepts one follow-up experiment,
so a stale or concurrent request cannot silently fork it; an explicit branch request may start another.
"""
from datetime import datetime, timezone

from app.research.preparation_store import PreparationStore, StalePreparation
from app.schemas.generalized_agent import AgentTurn
from app.schemas.contracts import SimulationResult
from app.schemas.investigation import HistoryEntry, InvestigationHistory, ScenarioOutcome

COLUMNS = {'parent': 'TEXT', 'origin': 'TEXT', 'label': 'TEXT', 'created_at': 'TEXT', 'turn_id': 'TEXT', 'config_hash': 'TEXT'}
MAX_ENTRIES = 80


class AgentTurnStore:
    def __init__(self, store: PreparationStore):
        self.store = store
        with store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS agent_turns (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS agent_results (id TEXT PRIMARY KEY, payload TEXT NOT NULL, child TEXT)')
            present = {row[1] for row in db.execute('PRAGMA table_info(agent_results)').fetchall()}
            for name, kind in COLUMNS.items():
                if name not in present:  # databases created before investigation history
                    db.execute(f'ALTER TABLE agent_results ADD COLUMN {name} {kind}')
            db.execute('CREATE INDEX IF NOT EXISTS agent_results_parent ON agent_results (parent)')
            db.execute('CREATE INDEX IF NOT EXISTS agent_results_config ON agent_results (config_hash)')

    def result(self, result_id):
        with self.store.connect() as db:
            row = db.execute('SELECT payload,child FROM agent_results WHERE id=?', (result_id,)).fetchone()
        if row is None: raise KeyError('Unknown agent result')
        return SimulationResult.model_validate_json(row[0]), row[1]

    @staticmethod
    def _insert(db, result, parent, origin, label, turn_id):
        db.execute('INSERT OR IGNORE INTO agent_results (id,payload,child,parent,origin,label,created_at,turn_id,config_hash) VALUES (?,?,NULL,?,?,?,?,?,?)',
            (result.result_id, result.model_dump_json(), parent, origin, (label or '')[:700] or None,
             datetime.now(timezone.utc).isoformat(), turn_id, result.configuration_hash))

    def seed(self, result: SimulationResult, *, origin='direct_simulation', label=None, parent_configuration_sha256=None):
        """Store a result made outside an agent turn. A direct control edit names its parent by configuration hash."""
        with self.store.connect() as db:
            parent = None
            if parent_configuration_sha256:
                row = db.execute('SELECT id FROM agent_results WHERE config_hash=? AND id<>? ORDER BY created_at DESC LIMIT 1',
                    (parent_configuration_sha256, result.result_id)).fetchone()
                parent = row[0] if row else None
            self._insert(db, result, parent, origin, label, None)

    def save(self, turn: AgentTurn, *, branch=False, origin='research', label=None):
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if turn.parent_result_id:
                row = db.execute('SELECT child FROM agent_results WHERE id=?', (turn.parent_result_id,)).fetchone()
                if row is None: raise KeyError('Unknown edit parent')
                if row[0] is not None and not branch: raise StalePreparation('This result already has a newer edit; reload it')
                if turn.result and row[0] is None:
                    db.execute('UPDATE agent_results SET child=? WHERE id=?', (turn.result.result_id, turn.parent_result_id))
            if turn.result:
                self._insert(db, turn.result, turn.parent_result_id, origin, label, turn.turn_id)
                # The identical result may already be stored without a turn (the saved demo, or a plain simulation).
                # Record the turn that produced it; a result that already has a turn keeps it.
                db.execute("UPDATE agent_results SET turn_id=?, origin=?, label=? WHERE id=? AND turn_id IS NULL AND parent IS NULL "
                    "AND origin IN ('saved_demo','direct_simulation')", (turn.turn_id, origin, (label or '')[:700] or None, turn.result.result_id))
            db.execute('INSERT INTO agent_turns VALUES (?,?)', (turn.turn_id, turn.model_dump_json()))
        return turn

    def read(self, turn_id):
        with self.store.connect() as db:
            row = db.execute('SELECT payload FROM agent_turns WHERE id=?', (turn_id,)).fetchone()
        if row is None: raise KeyError('Unknown agent turn')
        return AgentTurn.model_validate_json(row[0])

    # --- investigation history ---------------------------------------------------------------

    def _meta(self, db, result_id):
        row = db.execute('SELECT id,parent,origin,label,created_at,turn_id FROM agent_results WHERE id=?', (result_id,)).fetchone()
        return dict(zip(('id', 'parent', 'origin', 'label', 'created_at', 'turn_id'), row)) if row else None

    def meta(self, result_id):
        with self.store.connect() as db:
            found = self._meta(db, result_id)
            if found is None: raise KeyError('Unknown agent result')
            found['child_count'] = db.execute('SELECT count(*) FROM agent_results WHERE parent=?', (result_id,)).fetchone()[0]
        return found

    def lineage(self, result_id, limit=6):
        """Ancestors of a result, oldest first, ending with the result itself."""
        chain = []
        with self.store.connect() as db:
            current, seen = result_id, set()
            while current and current not in seen and len(chain) < 64:
                seen.add(current)
                found = self._meta(db, current)
                if found is None: break
                chain.append(found)
                current = found['parent']
        return list(reversed(chain))[-limit:], (chain[-1]['id'] if chain else result_id)

    def entry(self, meta, depth, child_count) -> HistoryEntry:
        result, head = self.result(meta['id'])
        config = result.configuration
        labels = {item.scenario_id: item.label for item in config.scenarios}
        turn = None
        if meta['turn_id']:
            try: turn = self.read(meta['turn_id'])
            except KeyError: turn = None
        synthesis = turn.synthesis if turn else None
        origin = meta['origin'] or 'direct_simulation'
        title = meta['label'] or {'research': 'Research', 'agent_edit': 'Experiment change', 'proposal': 'Follow-up experiment',
            'direct_control': 'Direct control change', 'saved_demo': 'Saved reviewed demo', 'direct_simulation': 'Simulation'}[origin]
        papers = turn.research_papers if turn else []
        return HistoryEntry(result_id=result.result_id, parent_result_id=meta['parent'], origin=origin, created_at=meta['created_at'], depth=depth,
            title=title[:700], changes=[item[:700] for item in (turn.applied_changes if turn else [])][:8], drug=config.drug[:200], target=config.target[:200],
            experiment_id=config.experiment_id, configuration_sha256=result.configuration_hash, client_revision=result.client_revision,
            duration_h=config.duration_h, occupancy_threshold=config.occupancy_threshold,
            outcomes=[ScenarioOutcome(scenario_id=s.scenario_id, label=labels[s.scenario_id][:200], endpoint_occupancy=s.metrics.endpoint_occupancy,
                threshold_status=s.metrics.threshold.status, total_time_above_h=s.metrics.threshold.total_time_above_h) for s in result.scenarios[:3]],
            turn_id=meta['turn_id'], verdict=synthesis.answer.verdict if synthesis and synthesis.answer else None,
            finding=synthesis.answer.statement[:700] if synthesis and synthesis.answer else None,
            papers=[paper.source.title[:700] for paper in papers[:4]], paper_count=len(papers),
            structure_pdb_id=turn.structure.metadata.provenance.pdb_id if turn and turn.structure and turn.structure.metadata else None,
            child_count=child_count, has_follow_up_experiment=head is not None)

    def history(self, result_id) -> InvestigationHistory:
        """The whole tree containing this result, parents before children, bounded in size."""
        _, root = self.lineage(result_id, limit=64)
        with self.store.connect() as db:
            if self._meta(db, root) is None: raise KeyError('Unknown agent result')
            ordered, queue, truncated = [], [(root, 0)], False
            while queue:
                current, depth = queue.pop(0)
                if len(ordered) >= MAX_ENTRIES:
                    truncated = True
                    break
                children = [row[0] for row in db.execute('SELECT id FROM agent_results WHERE parent=? ORDER BY created_at, id', (current,)).fetchall()]
                ordered.append((self._meta(db, current), depth, len(children)))
                # Depth-first so each branch reads top to bottom under its parent.
                queue = [(child, depth + 1) for child in children] + queue
        entries = [self.entry(meta, depth, count) for meta, depth, count in ordered]
        question = next((self.read(e.turn_id).original_text[:700] for e in entries if e.origin == 'research' and e.turn_id), None)
        return InvestigationHistory(root_result_id=root, requested_result_id=result_id, question=question, entries=entries, truncated=truncated)
