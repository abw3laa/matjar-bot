from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "matjar-bot-ai"
    environment: str = "development"
    host: str = "0.0.0.0"
    port: int = 8010
    ai_service_token: str = ""
    openai_api_key: str = ""
    openai_base_url: str | None = None
    ai_model: str = "gpt-5-mini"
    ai_timeout_seconds: float = 30

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
