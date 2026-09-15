import logging

from app.core.config import settings
from services.ocr.base import BaseOCRProvider
from services.ocr.mock_engine import MockOCREngine
from services.ocr.preprocessor import ImagePreprocessor

logger = logging.getLogger("legal_metrology.ocr")

_ENGINE_CACHE = {}


class OCREngineUnavailable(RuntimeError):
    """Raised when the configured real OCR engine cannot be used."""


def get_ocr_engine(provider: str = None) -> BaseOCRProvider:
    """
    Return the configured OCR engine.

    Default is PaddleOCR (real text extraction). The mock engine returns
    hardcoded sample text and is therefore only ever used when explicitly
    requested via OCR_PROVIDER=mock (tests/CI), or when
    OCR_ALLOW_MOCK_FALLBACK is deliberately enabled.
    """
    name = (provider or settings.OCR_PROVIDER or "paddleocr").lower()

    if name in _ENGINE_CACHE:
        return _ENGINE_CACHE[name]

    engine: BaseOCRProvider

    if name in ("paddle", "paddleocr"):
        from services.ocr.paddle_ocr_engine import PaddleOCREngine

        engine = PaddleOCREngine(
            lang=settings.PADDLE_OCR_LANG,
            use_textline_orientation=settings.PADDLE_USE_TEXTLINE_ORIENTATION,
        )
    elif name == "easyocr":
        from services.ocr.easy_ocr_engine import EasyOCREngine

        engine = EasyOCREngine(use_gpu=False)
    elif name == "mock":
        engine = MockOCREngine()
    else:
        raise OCREngineUnavailable(f"Unknown OCR_PROVIDER '{name}'")

    _ENGINE_CACHE[name] = engine
    return engine


def get_ocr_engine_safe(provider: str = None):
    """
    Resolve an engine without raising, returning (engine, provider_name, error).

    If the real engine cannot start (e.g. model weights unavailable offline) the
    error is surfaced so the pipeline can report `unable_to_verify` rather than
    silently substituting fabricated text.
    """
    name = (provider or settings.OCR_PROVIDER or "paddleocr").lower()
    try:
        engine = get_ocr_engine(name)
        checker = getattr(engine, "is_available", None)
        if callable(checker) and not checker():
            raise OCREngineUnavailable(
                f"OCR engine '{name}' is installed but its runtime/models are unavailable."
            )
        return engine, getattr(engine, "provider_name", name), None
    except Exception as exc:
        logger.error("OCR engine '%s' unavailable: %s", name, exc)
        if settings.OCR_ALLOW_MOCK_FALLBACK:
            logger.warning("OCR_ALLOW_MOCK_FALLBACK enabled - using MockOCREngine (SAMPLE DATA).")
            return MockOCREngine(), "mock", f"{name} unavailable: {exc}"
        return None, name, str(exc)


__all__ = [
    "BaseOCRProvider",
    "MockOCREngine",
    "ImagePreprocessor",
    "get_ocr_engine",
    "get_ocr_engine_safe",
    "OCREngineUnavailable",
]
