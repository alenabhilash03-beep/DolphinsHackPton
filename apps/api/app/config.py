from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    hypothesim_env: str = "development"
    hypothesim_cors_origins: list[str] = [
        "http://localhost:3000", "http://127.0.0.1:3000"
    ]
    hypothesim_llm_model: str = "nvidia/nemotron-3.5-super-vl-120b-a12b"
    nvidia_api_key: SecretStr | None = None
    langsmith_api_key: SecretStr | None = None
    langsmith_tracing: bool = False
    langsmith_project: str = "hypothesim-development"
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_workspace_id: str | None = None
    research_timeout_s: float = Field(default=300, gt=0, le=600)  # slow free-endpoint turns need headroom (2026-11-15)
    research_max_jobs: int = Field(default=4, ge=1, le=8)
    research_db_path: Path | None = None

    preparation_db_path: Path | None = None
    # Hosted accounts (5C.2). "off" keeps the single-user local workspace; "supabase" requires signed-in users
    # for agent, preparation and sharing endpoints and gives each user separate stores.
    auth_mode: Literal["off", "supabase"] = "off"
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None   # current Supabase name (sb_publishable_...)
    supabase_anon_key: str | None = None          # legacy name, still accepted
    workspaces_dir: Path | None = None
    agent_max_concurrent: int = Field(default=4, ge=1, le=16)
