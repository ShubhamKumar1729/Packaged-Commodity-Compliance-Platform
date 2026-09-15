"""
Data fusion: combines PaddleOCR text evidence with VLM visual observations into
a single EvidenceBundle for the rule engines.

Guarantees:
  * Never fabricates a value. Absent evidence => field.value is None.
  * Records provenance (which engine produced each field) and corroboration.
  * Flags conflicts when OCR and VLM disagree, rather than silently choosing.
"""
import logging
from typing import Any, Dict, Optional

from app.schemas.evidence import (
    EvidenceBundle,
    EvidenceSource,
    FusedField,
    OCREvidence,
    VLMEvidence,
)
from app.schemas.facts import ProductFacts
from app.schemas.ocr import OCRResult
from services.nlp.ingredient_extractor import IngredientExtractor

logger = logging.getLogger("legal_metrology.fusion")

# ProductFacts attributes promoted into fused fields.
_FACT_FIELDS = [
    "manufacturer_name", "manufacturer_address", "packer_name", "importer_name",
    "country_of_origin", "generic_name", "net_quantity_value", "net_quantity_unit",
    "unit_sale_price", "mrp_value", "mrp_currency", "inclusive_of_taxes_clause",
    "mfg_date", "pkd_date", "expiry_date", "best_before",
    "consumer_care_email", "consumer_care_phone", "consumer_care_address",
]


class DataFusionService:
    @staticmethod
    def build(
        ocr_result: Optional[OCRResult],
        facts: Optional[ProductFacts],
        vlm_evidence: Optional[VLMEvidence],
        cv_findings: Optional[Dict[str, Any]] = None,
        scan_id: Optional[str] = None,
        ocr_provider: str = "unknown",
        ocr_error: Optional[str] = None,
    ) -> EvidenceBundle:
        bundle = EvidenceBundle(scan_id=scan_id)

        # ---------------- OCR evidence ----------------
        if ocr_result is not None:
            bundle.ocr = OCREvidence(
                provider=ocr_provider,
                full_text=ocr_result.full_text or "",
                tokens=[t.model_dump() for t in ocr_result.tokens],
                average_confidence=ocr_result.average_confidence,
                token_count=len(ocr_result.tokens),
                image_width=ocr_result.image_width,
                image_height=ocr_result.image_height,
                available=bool(ocr_result.tokens),
                error=ocr_error,
            )
        else:
            bundle.ocr = OCREvidence(provider=ocr_provider, available=False, error=ocr_error)

        # ---------------- VLM evidence ----------------
        bundle.vlm = vlm_evidence or VLMEvidence(available=False, error="VLM not executed")
        bundle.cv = cv_findings or {}

        # ---------------- Text-derived fields ----------------
        if facts is not None:
            for name in _FACT_FIELDS:
                fv = getattr(facts, name, None)
                if fv is None or getattr(fv, "normalized_value", None) in (None, ""):
                    bundle.fields[name] = FusedField(field_name=name, source=EvidenceSource.NONE)
                    continue
                bundle.fields[name] = FusedField(
                    field_name=name,
                    value=fv.normalized_value,
                    raw_text=fv.raw_value,
                    confidence=float(fv.confidence or 0.0),
                    source=EvidenceSource.OCR,
                    bbox=fv.bbox,
                    corroborated_by=[EvidenceSource.OCR],
                )

        # ---------------- Ingredient block (FSSR) ----------------
        ing = IngredientExtractor.extract(bundle.ocr.full_text)
        bundle.fields["ingredients"] = FusedField(
            field_name="ingredients",
            value=ing if ing["found"] else None,
            raw_text=ing.get("raw_block"),
            confidence=bundle.ocr.average_confidence if ing["found"] else 0.0,
            source=EvidenceSource.OCR if ing["found"] else EvidenceSource.NONE,
            corroborated_by=[EvidenceSource.OCR] if ing["found"] else [],
            notes=None if ing["found"] else "No 'Ingredients' heading located in OCR text.",
        )

        # ---------------- Veg / non-veg mark (VLM primary, OCR corroboration) ----------------
        bundle.fields["veg_nonveg_mark"] = DataFusionService._fuse_veg_mark(bundle)

        # ---------------- Layout (VLM) ----------------
        layout_obs = bundle.vlm.get("text_layout") if bundle.vlm.available else None
        bundle.fields["text_layout"] = FusedField(
            field_name="text_layout",
            value=layout_obs.value if layout_obs else None,
            confidence=layout_obs.confidence if layout_obs else 0.0,
            source=EvidenceSource.VLM if layout_obs else EvidenceSource.NONE,
            corroborated_by=[EvidenceSource.VLM] if layout_obs else [],
        )

        return bundle

    # ------------------------------------------------------------------
    @staticmethod
    def _fuse_veg_mark(bundle: EvidenceBundle) -> FusedField:
        """VLM sees the symbol; OCR may see the words. Combine both."""
        obs = bundle.vlm.get("veg_nonveg_mark") if bundle.vlm.available else None
        text = (bundle.ocr.full_text or "").lower()

        textual: Optional[str] = None
        snippet: Optional[str] = None
        if "non-vegetarian" in text or "non vegetarian" in text or "nonveg" in text:
            textual, snippet = "non_vegetarian", "non-vegetarian"
        elif "vegetarian" in text or "veg." in text:
            textual, snippet = "vegetarian", "vegetarian"

        if obs is not None and textual is not None:
            conflict = obs.value != textual
            return FusedField(
                field_name="veg_nonveg_mark",
                value=obs.value,
                raw_text=snippet,
                confidence=min(0.99, obs.confidence + (0.0 if conflict else 0.1)),
                source=EvidenceSource.FUSION,
                bbox=obs.bbox,
                corroborated_by=[EvidenceSource.VLM, EvidenceSource.OCR],
                conflict=conflict,
                notes=(
                    f"VLM symbol '{obs.value}' conflicts with OCR text '{textual}'."
                    if conflict
                    else "VLM symbol corroborated by OCR text."
                ),
            )

        if obs is not None:
            return FusedField(
                field_name="veg_nonveg_mark",
                value=obs.value,
                confidence=obs.confidence,
                source=EvidenceSource.VLM,
                bbox=obs.bbox,
                corroborated_by=[EvidenceSource.VLM],
                notes=obs.rationale,
            )

        if textual is not None:
            return FusedField(
                field_name="veg_nonveg_mark",
                value=textual,
                raw_text=snippet,
                confidence=0.5,
                source=EvidenceSource.OCR,
                corroborated_by=[EvidenceSource.OCR],
                notes="Declared in text only; symbol not visually confirmed.",
            )

        return FusedField(
            field_name="veg_nonveg_mark",
            source=EvidenceSource.NONE,
            notes="Neither the statutory symbol nor a textual declaration was detected.",
        )


data_fusion_service = DataFusionService()
