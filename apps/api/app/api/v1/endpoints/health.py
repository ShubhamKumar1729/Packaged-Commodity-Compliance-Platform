from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.core.database import get_db
from services.compliance.registry import rule_registry

router = APIRouter(tags=["Health & Status"])

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

@router.get("/ready")
def readiness_check(db: Session = Depends(get_db)):
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    rules_count = len(rule_registry.get_active_rules())

    # Report the perception config of THIS process. A CLI check can easily use
    # a different environment than the running server, so the provider the
    # server will actually use must be observable without running a scan.
    ocr_provider = (settings.OCR_PROVIDER or "").lower()

    return {
        "status": "ready" if (db_ok and rules_count > 0) else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "active_legal_rules": rules_count,
        "storage_ready": settings.STORAGE_DIR.exists(),
        "ocr_provider": settings.OCR_PROVIDER,
        "vlm_provider": settings.VLM_PROVIDER,
        "ocr_allow_mock_fallback": settings.OCR_ALLOW_MOCK_FALLBACK,
        # True when scan text is fabricated sample data rather than real OCR.
        "using_mock_ocr": ocr_provider == "mock",
    }
