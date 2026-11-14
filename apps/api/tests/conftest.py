import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def experiment_data():
    return json.loads((ROOT / "data/examples/contract-experiment.json").read_text())
