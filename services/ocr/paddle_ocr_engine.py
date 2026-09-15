"""
PaddleOCR engine — real text extraction for PackSure.

Design notes:
  * CPU-only by default; no GPU assumptions.
  * Lazily constructs the PaddleOCR pipeline so importing this module is cheap
    and the API can boot even when model weights are not present yet.
  * Emits ONLY what PaddleOCR actually read. No synthetic tokens, no invented
    confidences, no placeholder text. If nothing is readable the result is an
    empty token list, which downstream fusion reports as `unable_to_verify`.
"""
import logging
import os
import re
import threading
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

# paddlepaddle 3.x ships an oneDNN (MKL-DNN) CPU backend that cannot execute
# the PP-OCRv6 detection graph: inference aborts with
#   NotImplementedError: ConvertPirAttribute2RuntimeAttribute not support
#   [pir::ArrayAttribute<pir::DoubleAttribute>]  (onednn_instruction.cc)
# Paddle reads these FLAGS_* env vars when its C++ runtime initialises, so they
# must be set BEFORE `paddle` is first imported anywhere in the process.
# Falling back to Paddle's native CPU kernels is slightly slower but correct.
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")

from app.schemas.ocr import OCRResult, OCRToken
from services.ocr.base import BaseOCRProvider
from services.ocr.preprocessor import ImagePreprocessor

logger = logging.getLogger("legal_metrology.ocr.paddle")


class PaddleOCRUnavailable(RuntimeError):
    """Raised when the PaddleOCR runtime or its model weights cannot be loaded."""


class PaddleOCREngine(BaseOCRProvider):
    """
    Primary OCR provider. Handles rotated / small / dense package-label text via
    PaddleOCR's detection + angle-classification + recognition pipeline.
    """

    provider_name = "paddleocr"

    # Recognition results below this score are dropped rather than guessed at.
    MIN_RECOGNITION_SCORE = 0.30

    def __init__(
        self,
        lang: str = "en",
        use_textline_orientation: bool = True,
        det_limit_side_len: int = 1536,
    ):
        self.lang = lang
        self.use_textline_orientation = use_textline_orientation
        self.det_limit_side_len = det_limit_side_len
        self._ocr = None
        self._lock = threading.Lock()
        # Separate lock: the availability probe calls _get_ocr(), which takes
        # _lock, and threading.Lock is not reentrant.
        self._avail_lock = threading.Lock()
        self._available: Optional[bool] = None

    # ------------------------------------------------------------------
    # Engine lifecycle
    # ------------------------------------------------------------------
    def _build(self):
        """Construct the underlying PaddleOCR pipeline (thread-safe, once)."""
        try:
            from paddleocr import PaddleOCR
        except Exception as exc:  # pragma: no cover - import guard
            raise PaddleOCRUnavailable(f"paddleocr is not installed: {exc}") from exc

        # PaddleOCR renamed several kwargs across 2.x -> 3.x. Try the modern
        # signature first and degrade gracefully instead of hard-failing.
        # `enable_mkldnn=False` is tried first: paddlepaddle 3.x's oneDNN CPU
        # kernels crash on the PP-OCRv6 detection graph. Older builds do not
        # accept the kwarg, so the variants below drop it.
        attempts: List[Dict[str, Any]] = [
            {
                "lang": self.lang,
                "use_textline_orientation": self.use_textline_orientation,
                "use_doc_orientation_classify": False,
                "use_doc_unwarping": False,
                "enable_mkldnn": False,
            },
            {
                "lang": self.lang,
                "use_textline_orientation": self.use_textline_orientation,
                "use_doc_orientation_classify": False,
                "use_doc_unwarping": False,
            },
            {"lang": self.lang, "use_angle_cls": self.use_textline_orientation, "show_log": False},
            {"lang": self.lang},
        ]

        last_error: Optional[Exception] = None
        for kwargs in attempts:
            try:
                return PaddleOCR(**kwargs)
            except TypeError as exc:
                last_error = exc
                continue
            except Exception as exc:
                # Typically a model-weight download failure (offline environment).
                raise PaddleOCRUnavailable(
                    f"PaddleOCR model initialisation failed: {exc}"
                ) from exc

        raise PaddleOCRUnavailable(f"Incompatible PaddleOCR signature: {last_error}")

    def _get_ocr(self):
        if self._ocr is None:
            with self._lock:
                if self._ocr is None:
                    logger.info("Initialising PaddleOCR (lang=%s, cpu)", self.lang)
                    self._ocr = self._build()
        return self._ocr

    def is_available(self) -> bool:
        """
        Probe whether the engine can actually run, without raising.

        Constructing the pipeline is not sufficient: paddlepaddle's oneDNN CPU
        backend only fails once a graph is executed. So run one tiny inference
        and treat a crash as unavailable.

        The result is cached: this runs on every scan, and a real inference is
        far too expensive to repeat as a health check.
        """
        if self._available is not None:
            return self._available

        with self._avail_lock:
            if self._available is not None:
                return self._available

            try:
                self._get_ocr()
            except Exception as exc:
                logger.warning("PaddleOCR unavailable: %s", exc)
                self._available = False
                return False

            try:
                probe = np.full((64, 160, 3), 255, dtype=np.uint8)
                cv2.putText(probe, "AB12", (8, 44), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 3)
                self._run(probe)
                self._available = True
            except Exception as exc:
                logger.warning("PaddleOCR loaded but inference failed: %s", exc)
                self._available = False

            return self._available

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------
    def _run(self, img: np.ndarray) -> List[Tuple[List[List[float]], str, float]]:
        """Normalise PaddleOCR 2.x and 3.x outputs into (polygon, text, score)."""
        ocr = self._get_ocr()

        raw = None
        predict_error: Optional[Exception] = None
        if hasattr(ocr, "predict"):
            try:
                raw = ocr.predict(img)
            except Exception as exc:
                predict_error = exc
                logger.debug("predict() failed, falling back to ocr(): %s", exc)
        if raw is None:
            try:
                raw = ocr.ocr(img)
            except Exception as exc:
                # In PaddleOCR 3.x, ocr() simply delegates to predict(), so this
                # is the same failure twice. Surface it as an engine-unavailable
                # error rather than a bare NotImplementedError from deep inside
                # Paddle: the caller must report `unable_to_verify`, never
                # substitute fabricated text.
                raise PaddleOCRUnavailable(
                    f"PaddleOCR inference failed: {exc}"
                ) from (predict_error or exc)

        out: List[Tuple[List[List[float]], str, float]] = []
        if not raw:
            return out

        for page in raw:
            # --- PaddleOCR 3.x: dict-like result objects ---
            data = None
            if isinstance(page, dict):
                data = page
            elif hasattr(page, "json"):
                try:
                    j = page.json
                    data = j.get("res", j) if isinstance(j, dict) else None
                except Exception:
                    data = None

            if isinstance(data, dict) and "rec_texts" in data:
                texts = data.get("rec_texts") or []
                scores = data.get("rec_scores") or []
                polys = data.get("rec_polys") or data.get("dt_polys") or []
                for i, text in enumerate(texts):
                    score = float(scores[i]) if i < len(scores) else 0.0
                    poly = polys[i] if i < len(polys) else None
                    poly = (
                        [[float(p[0]), float(p[1])] for p in np.asarray(poly).reshape(-1, 2)]
                        if poly is not None
                        else []
                    )
                    out.append((poly, str(text), score))
                continue

            # --- PaddleOCR 2.x: [[poly, (text, score)], ...] ---
            if not page:
                continue
            for line in page:
                try:
                    poly, rec = line[0], line[1]
                    text, score = (rec[0], float(rec[1])) if isinstance(rec, (list, tuple)) else (str(rec), 0.0)
                    poly = [[float(p[0]), float(p[1])] for p in poly]
                    out.append((poly, str(text), score))
                except Exception:
                    continue
        return out

    def extract(self, image_bytes: bytes) -> OCRResult:
        """
        Run the real OCR pipeline. Returns genuine text, scores and boxes.
        An empty token list is a legitimate outcome (unreadable label).
        """
        processed_img, _quality = ImagePreprocessor.preprocess_pipeline(
            image_bytes,
            apply_resize=True,
            apply_denoise=True,
            apply_contrast=True,
            apply_deskew=True,
        )
        height, width = processed_img.shape[:2]

        # PaddleOCR expects RGB.
        rgb = cv2.cvtColor(processed_img, cv2.COLOR_BGR2RGB)
        detections = self._run(rgb)

        # Reading order: banded top-to-bottom, then left-to-right.
        def sort_key(item):
            poly = item[0]
            if not poly:
                return (0.0, 0.0)
            top = min(p[1] for p in poly)
            left = min(p[0] for p in poly)
            band = round(top / max(1.0, height * 0.02))
            return (band, left)

        detections.sort(key=sort_key)

        tokens: List[OCRToken] = []
        for idx, (poly, text, score) in enumerate(detections, start=1):
            cleaned = re.sub(r"\s+", " ", (text or "")).strip()
            if not cleaned:
                continue
            if score < self.MIN_RECOGNITION_SCORE:
                # Too unreliable to assert as fact — drop rather than guess.
                continue

            if poly:
                xs = [p[0] for p in poly]
                ys = [p[1] for p in poly]
                x1, y1, x2, y2 = min(xs), min(ys), max(xs), max(ys)
                bbox = [
                    round(max(0.0, min(1.0, x1 / width)), 4),
                    round(max(0.0, min(1.0, y1 / height)), 4),
                    round(max(0.0, min(1.0, x2 / width)), 4),
                    round(max(0.0, min(1.0, y2 / height)), 4),
                ]
            else:
                bbox = [0.0, 0.0, 0.0, 0.0]

            tokens.append(
                OCRToken(
                    text=cleaned,
                    confidence=round(float(max(0.0, min(1.0, score))), 3),
                    bbox=bbox,
                    line_number=idx,
                )
            )

        full_text = "\n".join(t.text for t in tokens)
        avg_conf = round(sum(t.confidence for t in tokens) / len(tokens), 3) if tokens else 0.0

        return OCRResult(
            tokens=tokens,
            full_text=full_text,
            average_confidence=avg_conf,
            image_width=width,
            image_height=height,
        )
