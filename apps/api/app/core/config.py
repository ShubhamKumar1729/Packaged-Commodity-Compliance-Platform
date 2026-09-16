import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings

# Base repository root directory (5 levels up from apps/api/app/core/config.py)
REPO_ROOT = Path(__file__).resolve().parents[4]

class Settings(BaseSettings):
    PROJECT_NAME: str = "Legal Metrology Packaged Commodity Compliance Platform"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "dev-insecure-legal-metrology-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    
    # Dual-mode Database (SQLite for zero-config dev & demo, PostgreSQL in production)
    DATABASE_URL: str = f"sqlite:///{REPO_ROOT.as_posix()}/legal_metrology.db"
    
    # Storage Paths
    STORAGE_DIR: Path = REPO_ROOT / "storage"
    UPLOAD_DIR: Path = REPO_ROOT / "storage" / "uploads"
    EVIDENCE_DIR: Path = REPO_ROOT / "storage" / "evidence"
    REPORT_DIR: Path = REPO_ROOT / "storage" / "reports"
    ANNOTATED_DIR: Path = REPO_ROOT / "storage" / "annotated"
    
    # Authoritative Legal Metrology Rules Paths
    LEGAL_RULES_PATH: Path = REPO_ROOT / "data" / "legal" / "rules.json"
    FSSR_RULES_PATH: Path = REPO_ROOT / "data" / "legal" / "fssr_rules.json"
    COMMODITIES_PATH: Path = REPO_ROOT / "data" / "legal" / "commodities.json"
    EXEMPTIONS_PATH: Path = REPO_ROOT / "data" / "legal" / "exemptions.json"
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # OCR Provider: "paddleocr" (default, real OCR), "easyocr", or "mock" (tests/CI only)
    OCR_PROVIDER: str = "paddleocr"

    # PaddleOCR tuning (CPU-only by default)
    PADDLE_OCR_LANG: str = "en"
    PADDLE_USE_TEXTLINE_ORIENTATION: bool = True

    # VLM Provider: "heuristic" (local OpenCV visual analyser) or "none"
    VLM_PROVIDER: str = "heuristic"

    # When True, an unavailable real OCR engine silently falls back to the mock
    # engine. Must stay False in production: fabricated text is never acceptable.
    OCR_ALLOW_MOCK_FALLBACK: bool = False

    # Pia, the in-product assistant. Optional: when GROQ_API_KEY is empty the
    # assistant widget reports itself as unconfigured and nothing else changes.
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"

    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }

settings = Settings()

# Ensure storage directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.EVIDENCE_DIR, exist_ok=True)
os.makedirs(settings.REPORT_DIR, exist_ok=True)
os.makedirs(settings.ANNOTATED_DIR, exist_ok=True)
