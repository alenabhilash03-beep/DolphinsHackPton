from pathlib import Path

from pydantic import SecretStr
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
