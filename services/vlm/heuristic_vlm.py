"""
Local, dependency-free visual analyser used as the default VLM backend.

This is deliberately conservative: it only reports an observation when the
visual signal is strong and measurable. It uses classical colour/shape analysis
(OpenCV) to detect the statutory FSSAI vegetarian / non-vegetarian mark, which
is a precisely specified symbol:

    vegetarian      -> green filled circle inside a green square outline
    non-vegetarian  -> brown/maroon filled triangle inside a brown square outline

If the symbol is not confidently located, the observation is simply absent and
the corresponding rule reports `unable_to_verify`. It never guesses.
"""
import logging
from typing import List, Optional, Tuple

import cv2
import numpy as np

from app.schemas.evidence import VLMEvidence, VLMObservation
from services.ocr.preprocessor import ImagePreprocessor
from services.vlm.base import BaseVLMProvider

logger = logging.getLogger("legal_metrology.vlm.heuristic")


class HeuristicVLMProvider(BaseVLMProvider):
    provider_name = "heuristic_cv"

    MIN_AREA_RATIO = 0.00015
    MAX_AREA_RATIO = 0.08
    MIN_CONFIDENCE = 0.55

    def is_available(self) -> bool:
        return True

    # ------------------------------------------------------------------
    def analyze(self, image_bytes: bytes, ocr_text: str = "") -> VLMEvidence:
        try:
            img = ImagePreprocessor.decode_image(image_bytes)
        except Exception as exc:
            return VLMEvidence(provider=self.provider_name, available=False, error=str(exc))

        observations: List[VLMObservation] = []

        mark = self._detect_veg_mark(img)
        if mark is not None:
            kind, confidence, bbox, rationale = mark
            observations.append(
                VLMObservation(
                    attribute="veg_nonveg_mark",
                    value=kind,
                    confidence=round(confidence, 3),
                    bbox=bbox,
                    rationale=rationale,
                )
            )

        layout = self._describe_layout(img)
        if layout is not None:
            observations.append(layout)

        return VLMEvidence(
            provider=self.provider_name,
            observations=observations,
            available=True,
        )

    # ------------------------------------------------------------------
    def _detect_veg_mark(
        self, img: np.ndarray
    ) -> Optional[Tuple[str, float, List[float], str]]:
        """Locate the FSSAI veg/non-veg symbol by colour + enclosed shape."""
        h, w = img.shape[:2]
        area_total = float(h * w)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        # Green (vegetarian) and brown/red (non-vegetarian) colour gates.
        green = cv2.inRange(hsv, np.array([35, 80, 40]), np.array([88, 255, 255]))
        brown = cv2.bitwise_or(
            cv2.inRange(hsv, np.array([0, 90, 30]), np.array([18, 255, 220])),
            cv2.inRange(hsv, np.array([165, 90, 30]), np.array([180, 255, 220])),
        )

        best: Optional[Tuple[str, float, List[float], str]] = None

        for kind, mask in (("vegetarian", green), ("non_vegetarian", brown)):
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

            # RETR_CCOMP keeps the square outline (outer) *and* the filled inner
            # glyph, which is exactly what the statutory mark is made of.
            contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
            if hierarchy is None:
                continue
            hierarchy = hierarchy[0]

            for idx, cnt in enumerate(contours):
                area = cv2.contourArea(cnt)
                if not (self.MIN_AREA_RATIO * area_total <= area <= self.MAX_AREA_RATIO * area_total):
                    continue

                x, y, bw, bh = cv2.boundingRect(cnt)
                if bw == 0 or bh == 0:
                    continue

                # The statutory mark is enclosed in a square: aspect ratio ~1.
                aspect = bw / float(bh)
                if not (0.72 <= aspect <= 1.38):
                    continue

                # Evaluate the enclosed glyph when present, else the shape itself.
                candidates = [cnt]
                child = hierarchy[idx][2]
                while child != -1:
                    child_area = cv2.contourArea(contours[child])
                    if child_area >= self.MIN_AREA_RATIO * area_total * 0.4:
                        candidates.append(contours[child])
                    child = hierarchy[child][0]

                for shape in candidates:
                    s_area = cv2.contourArea(shape)
                    if s_area <= 0:
                        continue
                    sx, sy, sw, sh = cv2.boundingRect(shape)
                    if sw == 0 or sh == 0:
                        continue
                    peri = cv2.arcLength(shape, True)
                    if peri <= 0:
                        continue

                    extent = s_area / float(sw * sh)
                    circularity = 4.0 * np.pi * s_area / (peri * peri)
                    approx = cv2.approxPolyDP(shape, 0.04 * peri, True)

                    if kind == "vegetarian":
                        # Filled circle: high circularity, extent near pi/4 (~0.785).
                        if circularity < 0.70 or not (0.62 <= extent <= 0.95):
                            continue
                        confidence = min(0.95, 0.45 + circularity * 0.5)
                        rationale = (
                            f"Green filled circular mark inside a square detected "
                            f"(circularity={circularity:.2f}, aspect={aspect:.2f}), "
                            "consistent with the vegetarian symbol."
                        )
                    else:
                        # Filled triangle: 3 vertices, extent near 0.5.
                        if len(approx) != 3 or not (0.35 <= extent <= 0.72):
                            continue
                        confidence = min(0.92, 0.55 + (0.2 - min(0.2, abs(extent - 0.5))))
                        rationale = (
                            f"Brown filled triangular mark inside a square detected "
                            f"(vertices=3, extent={extent:.2f}, aspect={aspect:.2f}), "
                            "consistent with the non-vegetarian symbol."
                        )

                    if confidence < self.MIN_CONFIDENCE:
                        continue

                    bbox = [
                        round(x / w, 4),
                        round(y / h, 4),
                        round((x + bw) / w, 4),
                        round((y + bh) / h, 4),
                    ]
                    if best is None or confidence > best[1]:
                        best = (kind, confidence, bbox, rationale)

        return best

    # ------------------------------------------------------------------
    def _describe_layout(self, img: np.ndarray) -> Optional[VLMObservation]:
        """Report where dense text sits — supports Rule 9 PDP grouping review."""
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape[:2]
            grad = cv2.morphologyEx(
                gray, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            )
            _, binar = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
            density = float(np.count_nonzero(binar)) / float(h * w)

            top = float(np.count_nonzero(binar[: h // 2, :]))
            bottom = float(np.count_nonzero(binar[h // 2 :, :]))
            total = top + bottom
            if total <= 0:
                return None
            region = "upper_panel" if top > bottom else "lower_panel"

            return VLMObservation(
                attribute="text_layout",
                value={
                    "text_density": round(density, 4),
                    "dominant_text_region": region,
                    "upper_share": round(top / total, 3),
                },
                confidence=0.6,
                rationale="Morphological gradient density used to locate the dominant text panel.",
            )
        except Exception:
            return None
