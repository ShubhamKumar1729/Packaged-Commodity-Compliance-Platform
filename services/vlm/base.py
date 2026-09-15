"""
Vision-Language Model provider interface.

PackSure uses a VLM *alongside* PaddleOCR — never instead of it. The VLM answers
questions OCR cannot: visual symbols (veg / non-veg marks), label layout and
panel grouping, and corroboration of text OCR read with low confidence.

Contract: a provider returns only what it actually observed. When a provider is
not configured or a call fails, it returns an unavailable VLMEvidence — which
the rule engine converts into `unable_to_verify`, never into `compliant`.
"""
from abc import ABC, abstractmethod

from app.schemas.evidence import VLMEvidence


class BaseVLMProvider(ABC):
    provider_name: str = "base"

    @abstractmethod
    def analyze(self, image_bytes: bytes, ocr_text: str = "") -> VLMEvidence:
        """Return visual observations for the supplied package image."""
        raise NotImplementedError

    def is_available(self) -> bool:
        return False
