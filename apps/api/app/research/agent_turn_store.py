"""Durable turns and linear result revisions; stale edits never replace a newer child."""
from app.research.preparation_store import PreparationStore, StalePreparation
from app.schemas.generalized_agent import AgentTurn
from app.schemas.contracts import SimulationResult

class AgentTurnStore:
    def __init__(self, store: PreparationStore):
        self.store = store
        with store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS agent_turns (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS agent_results (id TEXT PRIMARY KEY, payload TEXT NOT NULL, child TEXT)')

    def result(self, result_id):
        with self.store.connect() as db:
            row = db.execute('SELECT payload,child FROM agent_results WHERE id=?', (result_id,)).fetchone()
        if row is None: raise KeyError('Unknown agent result')
        return SimulationResult.model_validate_json(row[0]), row[1]

    def seed(self, result: SimulationResult):
        with self.store.connect() as db:
            db.execute('INSERT OR IGNORE INTO agent_results VALUES (?,?,NULL)', (result.result_id, result.model_dump_json()))

    def save(self, turn: AgentTurn):
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if turn.parent_result_id:
                row = db.execute('SELECT child FROM agent_results WHERE id=?', (turn.parent_result_id,)).fetchone()
                if row is None: raise KeyError('Unknown edit parent')
                if row[0] is not None: raise StalePreparation('This result already has a newer edit; reload it')
                if turn.result:
                    db.execute('UPDATE agent_results SET child=? WHERE id=?', (turn.result.result_id, turn.parent_result_id))
            if turn.result:
                db.execute('INSERT OR IGNORE INTO agent_results VALUES (?,?,NULL)', (turn.result.result_id, turn.result.model_dump_json()))
            db.execute('INSERT INTO agent_turns VALUES (?,?)', (turn.turn_id, turn.model_dump_json()))
        return turn

    def read(self, turn_id):
        with self.store.connect() as db:
            row = db.execute('SELECT payload FROM agent_turns WHERE id=?', (turn_id,)).fetchone()
        if row is None: raise KeyError('Unknown agent turn')
        return AgentTurn.model_validate_json(row[0])
