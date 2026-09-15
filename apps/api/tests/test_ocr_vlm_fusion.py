"""
Tests for the PaddleOCR engine adapter, the VLM provider, and data fusion.

The PaddleOCR engine is exercised through injected stub pipelines so the suite
runs without model weights, while still validating the real parsing paths for
both PaddleOCR 2.x and 3.x output shapes.
"""
import cv2
import numpy as np
import pytest

from app.schemas.evidence import EvidenceSource, VLMEvidence
from app.schemas.facts import FactValue, ProductFacts
from app.schemas.ocr import OCRResult, OCRToken
from services.fusion.data_fusion import data_fusion_service
from services.ocr.paddle_ocr_engine import PaddleOCREngine
from services.vlm.heuristic_vlm import HeuristicVLMProvider


def _blank_jpeg(w=600, h=400):
    return cv2.imencode(".jpg", np.full((h, w, 3), 255, np.uint8))[1].tobytes()


class _Stub3x:
    """Mimics PaddleOCR 3.x dict output."""
    def predict(self, img):
        return [{
            "rec_texts": ["MRP Rs. 45.00", "Ingredients: Sugar", "   ", "garbled"],
            "rec_scores": [0.97, 0.91, 0.55, 0.08],
            "rec_polys": [
                [[10, 10], [200, 10], [200, 40], [10, 40]],
                [[10, 60], [300, 60], [300, 90], [10, 90]],
                [[0, 0], [5, 0], [5, 5], [0, 5]],
                [[10, 110], [90, 110], [90, 130], [10, 130]],
            ],
        }]


class _Stub2x:
    """Mimics PaddleOCR 2.x nested-list output."""
    def ocr(self, img):
        return [[[[[10, 10], [200, 10], [200, 40], [10, 40]], ("Net Qty 500 g", 0.93)]]]


# ---------------------------------------------------------------- OCR engine
def test_paddle_engine_parses_3x_output_with_real_scores():
    engine = PaddleOCREngine()
    engine._ocr = _Stub3x()
    result = engine.extract(_blank_jpeg())

    texts = [t.text for t in result.tokens]
    assert "MRP Rs. 45.00" in texts
    assert "Ingredients: Sugar" in texts
    # Blank text and sub-threshold recognition are discarded, not guessed at.
    assert "garbled" not in texts
    assert all(t.text.strip() for t in result.tokens)
    assert result.average_confidence == pytest.approx(0.94, abs=0.01)


def test_paddle_engine_parses_2x_output():
    engine = PaddleOCREngine()
    engine._ocr = _Stub2x()
    result = engine.extract(_blank_jpeg())
    assert [t.text for t in result.tokens] == ["Net Qty 500 g"]
    assert result.tokens[0].confidence == pytest.approx(0.93)


def test_paddle_bboxes_are_normalised():
    engine = PaddleOCREngine()
    engine._ocr = _Stub3x()
    for token in engine.extract(_blank_jpeg()).tokens:
        assert len(token.bbox) == 4
        for v in token.bbox:
            assert 0.0 <= v <= 1.0


def test_paddle_engine_returns_empty_when_nothing_detected():
    class _Empty:
        def predict(self, img):
            return []

    engine = PaddleOCREngine()
    engine._ocr = _Empty()
    result = engine.extract(_blank_jpeg())
    assert result.tokens == []
    assert result.full_text == ""
    assert result.average_confidence == 0.0  # never a fabricated score


# ---------------------------------------------------------------- VLM
def _symbol_image(non_veg=False):
    img = np.full((600, 400, 3), 255, np.uint8)
    cx, cy, s = 330, 480, 30
    colour = (19, 69, 139) if non_veg else (20, 140, 20)
    cv2.rectangle(img, (cx - s, cy - s), (cx + s, cy + s), colour, 3)
    if non_veg:
        r = int(s * 0.62)
        tri = np.array([[cx, cy - r], [cx + int(r * 1.1), cy + r], [cx - int(r * 1.1), cy + r]])
        cv2.drawContours(img, [tri], 0, colour, -1)
    else:
        cv2.circle(img, (cx, cy), int(s * 0.6), colour, -1)
    return cv2.imencode(".jpg", img)[1].tobytes()


def test_vlm_detects_vegetarian_mark():
    obs = HeuristicVLMProvider().analyze(_symbol_image(False)).get("veg_nonveg_mark")
    assert obs is not None and obs.value == "vegetarian"
    assert obs.bbox is not None and obs.confidence > 0.5


def test_vlm_detects_non_vegetarian_mark():
    obs = HeuristicVLMProvider().analyze(_symbol_image(True)).get("veg_nonveg_mark")
    assert obs is not None and obs.value == "non_vegetarian"


def test_vlm_does_not_hallucinate_on_blank_image():
    evidence = HeuristicVLMProvider().analyze(_blank_jpeg())
    assert evidence.available is True
    assert evidence.get("veg_nonveg_mark") is None


# ---------------------------------------------------------------- fusion
def _ocr_result(text):
    return OCRResult(
        tokens=[OCRToken(text=text, confidence=0.9, bbox=[0.1, 0.1, 0.9, 0.2])],
        full_text=text, average_confidence=0.9, image_width=800, image_height=1000,
    )


def test_fusion_records_ocr_provenance_for_facts():
    facts = ProductFacts(
        mrp_value=FactValue(raw_value="MRP Rs. 45", normalized_value=45.0, confidence=0.95)
    )
    bundle = data_fusion_service.build(
        _ocr_result("MRP Rs. 45"), facts, VLMEvidence(available=False), {}, "s1", "paddleocr"
    )
    mrp = bundle.field("mrp_value")
    assert mrp.found and mrp.value == 45.0
    assert mrp.source == EvidenceSource.OCR
    assert bundle.ocr.provider == "paddleocr"


def test_fusion_marks_absent_fields_as_not_found():
    bundle = data_fusion_service.build(
        _ocr_result("no declarations"), ProductFacts(), VLMEvidence(available=False), {}, "s2", "paddleocr"
    )
    field = bundle.field("mrp_value")
    assert field.found is False
    assert field.value is None
    assert field.source == EvidenceSource.NONE


def test_fusion_handles_unavailable_ocr_without_inventing_text():
    bundle = data_fusion_service.build(
        None, None, VLMEvidence(available=False), {}, "s3", "paddleocr", ocr_error="models missing"
    )
    assert bundle.ocr.available is False
    assert bundle.ocr.full_text == ""
    assert bundle.has_text() is False
    assert bundle.ocr.error == "models missing"
