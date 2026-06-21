from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    
    def split_list(self, value: str) -> set[str]:
        return {item.strip() for item in value.split(",")}

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Environment — set to "local" to enable dev-mode auth bypass (no Google OAuth needed)
    ENVIRONMENT: str = "local"

    # Database config
    DATABASE_URL: str
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800

    # Celery config
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    # Google OAuth
    GOOGLE_CLIENT_ID:     str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI:  str
    GOOGLE_TOKEN_URL: str = "https://oauth2.googleapis.com/token"
    GOOGLE_AUTH_URL: str = "https://accounts.google.com/o/oauth2/v2/auth"
    GOOGLE_USERINFO_URL: str= "https://www.googleapis.com/oauth2/v3/userinfo"

    # JWT
    JWT_SECRET:       str
    JWT_ALGORITHM:    str = "HS256"
    JWT_EXPIRE_MINS:  int = 10080  # 7 days

    # Postgres
    DATABASE_URL: str

    # Gemini
    GOOGLE_API_KEY: str

    # RAG
    EMBED_MODEL:   str = "models/gemini-embedding-2"
    CHAT_MODEL:    str = "gemini-2.5-flash"
    CHROMA_PATH:   str = "chroma_store"
    CHUNK_SIZE:    int = 500
    CHUNK_OVERLAP: int = 50
    CHUNK_THRESHOLD: int = 20
    TOP_K:         int = 5

    # Other
    ALLOWED_EXTENSIONS: str = ".pdf,.txt,.md"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    MAX_FILE_SIZE_MB: int = 5

    REACT_APP_URL: str = "http://localhost:5173"

    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL: int = 3600   # seconds
    CACHE_SIMILARITY: float = 0.95 # normalized match threshold

    CHAT_HISTORY_LIMIT: int = 6  # last 6 (user + assistant)

    LOG_LEVEL: str = "INFO"

    # dev user details
    DEV_USER_EMAIL: str = "karthik@test.com"
    DEV_USER_GOOGLE_ID: str = "dev-local-bypass"
    DEV_USER_NAME: str ="Karthik"

    @property
    def allowed_extensions(self) -> list[str]:
        return list(self.split_list(self.ALLOWED_EXTENSIONS_RAW))

    @property
    def allowed_origins(self) -> list[str]:
        return list(self.split_list(self.ALLOWED_ORIGINS))

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

settings = Settings()