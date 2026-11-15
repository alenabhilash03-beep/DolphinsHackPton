"""Per-user scientific workspaces (5C.2).

Result IDs are hashes of the experiment configuration, and each result accepts one follow-up experiment.
On a shared server two users running the same question would therefore share results, history and the
follow-up slot. Each signed-in user instead gets separate preparation, result-tree, history and job stores.
The local single-user mode keeps the original stores.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import BoundedSemaphore, Lock
from typing import Callable

from app.auth import User


@dataclass
class Workspace:
    preparations: object
    agent: object
    queue: object


class WorkspaceRegistry:
    def __init__(self, local: Callable[[], Workspace], base_dir: Path, factory: Callable[[Path], Workspace],
                 max_concurrent: int = 4):
        self.local = local              # resolved on each request, so tests can replace app state
        self.base_dir = base_dir
        self.factory = factory
        self.slots = BoundedSemaphore(max_concurrent)  # shared across users: bounds total agent runs
        self._users: dict[str, Workspace] = {}
        self._lock = Lock()

    def for_user(self, user: User | None) -> Workspace:
        if user is None or user.is_local:
            return self.local()
        with self._lock:
            workspace = self._users.get(user.id)
            if workspace is None:
                directory = self.base_dir / 'users' / user.id
                directory.mkdir(parents=True, exist_ok=True)
                workspace = self._users[user.id] = self.factory(directory)
            return workspace

    def close(self):
        for workspace in self._users.values():
            workspace.queue.close()
