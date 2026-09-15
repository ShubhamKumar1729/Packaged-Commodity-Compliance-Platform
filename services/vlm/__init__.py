"""
VLM provider registry.

Selection is driven by settings.VLM_PROVIDER:
    "heuristic" (default) -> local OpenCV symbol/layout analyser, zero extra deps
    "none"                -> disabled; all VLM-dependent rules become unable_to_verify
"""
import logging

from services.vlm.base import BaseVLMProvider
from services.vlm.heuristic_vlm import HeuristicVLMProvider

logger = logging.getLogger("legal_metrology.vlm")

_INSTANCE = None


class DisabledVLMProvider(BaseVLMProvider):
    provider_name = "disabled"

    def is_available(self) -> bool:
        return False

    def analyze(self, image_bytes: bytes, ocr_text: str = ""):
        from app.schemas.evidence import VLMEvidence

        return VLMEvidence(
            provider=self.provider_name,
            available=False,
            error="VLM provider is disabled (VLM_PROVIDER=none).",
        )


def get_vlm_provider() -> BaseVLMProvider:
    """Return the configured VLM provider singleton."""
    global _INSTANCE
    if _INSTANCE is not None:
        return _INSTANCE

    try:
        from app.core.config import settings

        provider = str(getattr(settings, "VLM_PROVIDER", "heuristic")).lower()
    except Exception:
        provider = "heuristic"

    if provider in ("none", "off", "disabled"):
        _INSTANCE = DisabledVLMProvider()
    else:
        _INSTANCE = HeuristicVLMProvider()

    logger.info("VLM provider: %s", _INSTANCE.provider_name)
    return _INSTANCE


__all__ = [
    "BaseVLMProvider",
    "HeuristicVLMProvider",
    "DisabledVLMProvider",
    "get_vlm_provider",
]
