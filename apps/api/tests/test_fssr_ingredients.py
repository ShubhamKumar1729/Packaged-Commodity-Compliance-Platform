"""
FSSR 2020 ingredient rule family tests.

Covers parsing, each rule outcome, and — most importantly — that missing or
unreadable evidence NEVER yields a compliant verdict.
"""
import pytest

from app.schemas.evidence import (
    EvidenceSource,
    RuleFamily,
    VerificationStatus,
    VLMEvidence,
    VLMObservation,
)
from app.schemas.ocr import OCRResult, OCRToken
from services.compliance.fssr_evaluator import fssr_evaluator
from services.fusion.data_fusion import data_fusion_service
from services.nlp.ingredient_extractor import IngredientExtractor

GOOD_LABEL = (
    "INGREDIENTS: Wheat Flour (62%), Sugar (18%), Palm Oil (12%), "
    "Milk Solids (4%), Salt, Raising Agent (INS 500(ii)), Preservative (INS 211)\n"
    "CONTAINS WHEAT AND MILK."
)


def _ocr(text: str) -> OCRResult:
    lines = [l for l in text.split("\n") if l.strip()]
    tokens = [
        OCRToken(text=l, confidence=0.92, bbox=[0.1, min(0.95, 0.08 * i), 0.9, min(0.99, 0.08 * i + 0.05)])
        for i, l in enumerate(lines, start=1)
    ]
    return OCRResult(
        tokens=tokens, full_text=text, average_confidence=0.92,
        image_width=800, image_height=1000,
    )


def _bundle(text, vlm=None, commodity="GENERAL_PACKAGED_GOODS"):
    return data_fusion_service.build(
        ocr_result=_ocr(text), facts=None,
        vlm_evidence=vlm or VLMEvidence(available=False, error="disabled"),
        cv_findings={}, scan_id="test", ocr_provider="paddleocr",
    )


def _by_id(results):
    return {r.rule_id: r for r in results}


# ---------------------------------------------------------------- parsing
def test_ingredient_parsing_with_percentages_and_brackets():
    r = IngredientExtractor.extract(GOOD_LABEL)
    assert r["found"] is True
    names = [i["name"] for i in r["ingredients"]]
    assert "Wheat Flour" in names
    assert "Raising Agent" in names  # nested bracket INS 500(ii) handled
    assert r["ingredients"][0]["percentage"] == 62.0
    assert {a["category"] for a in r["allergens"]} >= {"cereals_containing_gluten", "milk"}
    assert any(a["type"] == "INS" for a in r["additives"])
    assert "CONTAINS" in (r["allergen_statement"] or "").upper()


def test_no_ingredients_heading_returns_not_found():
    r = IngredientExtractor.extract("MRP Rs. 45.00 Net Qty 100 g")
    assert r["found"] is False
    assert r["ingredients"] == []


def test_ingredient_block_stops_at_nutrition_heading():
    r = IngredientExtractor.extract(
        "Ingredients: Rice, Salt\nNUTRITIONAL INFORMATION\nEnergy 400 kcal Protein 8 g"
    )
    names = [i["name"].lower() for i in r["ingredients"]]
    assert "rice" in names
    assert not any("energy" in n for n in names)


# ---------------------------------------------------------------- rules
def test_compliant_label_passes_core_rules():
    res = _by_id(fssr_evaluator.evaluate(_bundle(GOOD_LABEL)))
    assert res["FSSR_2020_INGREDIENTS_LIST"].status == VerificationStatus.COMPLIANT
    assert res["FSSR_2020_INGREDIENTS_ORDER"].status == VerificationStatus.COMPLIANT
    assert res["FSSR_2020_ALLERGEN_DECLARATION"].status == VerificationStatus.COMPLIANT
    assert res["FSSR_2020_ADDITIVES_INS"].status == VerificationStatus.COMPLIANT
    for r in res.values():
        assert r.rule_family == RuleFamily.FSSR_2020
        assert r.explanation


def test_ascending_percentages_flagged_as_violation():
    res = _by_id(fssr_evaluator.evaluate(_bundle("Ingredients: Sugar (10%), Wheat Flour (70%)")))
    assert res["FSSR_2020_INGREDIENTS_ORDER"].status == VerificationStatus.VIOLATION


def test_ins_without_class_name_is_violation():
    res = _by_id(fssr_evaluator.evaluate(_bundle("Ingredients: Water, INS 330, INS 211")))
    assert res["FSSR_2020_ADDITIVES_INS"].status == VerificationStatus.VIOLATION


def test_missing_ingredients_on_readable_label_is_violation():
    res = _by_id(fssr_evaluator.evaluate(_bundle("MRP Rs. 45.00\nNet Qty 100 g\nMfd 08/2026")))
    assert res["FSSR_2020_INGREDIENTS_LIST"].status == VerificationStatus.VIOLATION


# ------------------------------------------------- unable_to_verify guarantees
def test_unreadable_image_never_reports_compliant():
    results = fssr_evaluator.evaluate(_bundle(""))
    assert results, "evaluator must still emit results"
    for r in results:
        assert r.status == VerificationStatus.UNABLE_TO_VERIFY, r.rule_id
        assert r.status != VerificationStatus.COMPLIANT


def test_single_percentage_cannot_verify_order():
    res = _by_id(fssr_evaluator.evaluate(_bundle("Ingredients: Rice (99%), Salt")))
    assert res["FSSR_2020_INGREDIENTS_ORDER"].status == VerificationStatus.UNABLE_TO_VERIFY


def test_veg_mark_absent_is_unable_to_verify_not_violation():
    res = _by_id(fssr_evaluator.evaluate(_bundle(GOOD_LABEL)))
    mark = res["FSSR_2020_VEG_NONVEG_MARK"]
    assert mark.status == VerificationStatus.UNABLE_TO_VERIFY
    assert mark.extracted_value is None  # never fabricated


def test_veg_mark_detected_by_vlm_is_compliant_with_evidence():
    vlm = VLMEvidence(
        provider="test", available=True,
        observations=[VLMObservation(
            attribute="veg_nonveg_mark", value="vegetarian",
            confidence=0.88, bbox=[0.7, 0.8, 0.8, 0.9], rationale="green circle in square",
        )],
    )
    res = _by_id(fssr_evaluator.evaluate(_bundle(GOOD_LABEL, vlm=vlm)))
    mark = res["FSSR_2020_VEG_NONVEG_MARK"]
    assert mark.status == VerificationStatus.COMPLIANT
    assert mark.extracted_value == "vegetarian"
    assert mark.evidence and mark.evidence[0].bbox is not None


def test_conflicting_vlm_and_ocr_marks_is_unable_to_verify():
    vlm = VLMEvidence(
        provider="test", available=True,
        observations=[VLMObservation(attribute="veg_nonveg_mark", value="non_vegetarian", confidence=0.8)],
    )
    bundle = _bundle("Ingredients: Milk\nThis is a vegetarian product", vlm=vlm)
    assert bundle.field("veg_nonveg_mark").conflict is True
    res = _by_id(fssr_evaluator.evaluate(bundle))
    assert res["FSSR_2020_VEG_NONVEG_MARK"].status == VerificationStatus.UNABLE_TO_VERIFY


def test_every_result_carries_evidence_contract_fields():
    for r in fssr_evaluator.evaluate(_bundle(GOOD_LABEL)):
        assert r.rule_id and r.rule_family and r.status
        assert r.expected_value is not None
        assert isinstance(r.confidence, float)
        assert r.source in list(EvidenceSource)
        assert r.explanation
