from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "matjar-bot-api"
    environment: str = "development"
    host: str = "0.0.0.0"
    port: int = 8000
    database_url: str = "postgresql://matjar:change-me@localhost:5432/matjar"
    jwt_secret: str = "change-me-in-production"
    jwt_expire_minutes: int = 60
    internal_api_token: str = ""
    cors_origins: str = "http://localhost:8081,http://localhost:19006"
    upload_base_url: str = "https://storage.example.com"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
