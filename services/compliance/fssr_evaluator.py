"""
FSSR 2020 ingredient rule family evaluator.

Completely separate from the PCR 2011 evaluator. Operates only on the fused
EvidenceBundle and emits RuleResult objects with lowercase evidence statuses.

Golden rule: missing evidence is NEVER compliant. It is `unable_to_verify`.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.schemas.evidence import (
    EvidenceBundle,
    EvidenceRef,
    EvidenceSource,
    RuleFamily,
    RuleResult,
    VerificationStatus,
)

logger = logging.getLogger("legal_metrology.fssr")

# Foods that legitimately need no ingredient list (single-ingredient foods).
SINGLE_INGREDIENT_COMMODITIES = {
    "FOOD_GRAINS", "PULSES", "SUGAR", "SALT", "TEA", "COFFEE_BEANS",
    "SPICES_WHOLE", "EDIBLE_OIL_SINGLE",
}


class FSSRIngredientEvaluator:
    RULES_FILENAME = "fssr_rules.json"

    def __init__(self, rules_path: Optional[Path] = None):
        self._rules: List[Dict[str, Any]] = []
        self._rules_path = rules_path
        self._load()

    def _load(self) -> None:
        path = self._rules_path
        if path is None:
            try:
                from app.core.config import settings

                path = Path(settings.LEGAL_RULES_PATH).parent / self.RULES_FILENAME
            except Exception:
                path = Path(__file__).resolve().parents[2] / "data" / "legal" / self.RULES_FILENAME
        try:
            with open(path, "r", encoding="utf-8") as fh:
                self._rules = json.load(fh).get("rules", [])
        except Exception as exc:
            logger.warning("Could not load FSSR rules from %s: %s", path, exc)
            self._rules = []

    def get_rules(self) -> List[Dict[str, Any]]:
        return [r for r in self._rules if r.get("enabled", True)]

    def _rule(self, rule_id: str) -> Dict[str, Any]:
        for r in self._rules:
            if r["rule_id"] == rule_id:
                return r
        return {"rule_id": rule_id, "title": rule_id, "source_rule": "", "severity": "MEDIUM"}

    # ------------------------------------------------------------------
    def evaluate(
        self, bundle: EvidenceBundle, commodity_type: str = "GENERAL_PACKAGED_GOODS"
    ) -> List[RuleResult]:
        results: List[RuleResult] = []
        ing_field = bundle.field("ingredients")
        data: Optional[Dict[str, Any]] = ing_field.value if ing_field.found else None

        results.append(self._eval_list(bundle, ing_field, data, commodity_type))
        results.append(self._eval_order(bundle, ing_field, data))
        results.append(self._eval_allergens(bundle, ing_field, data))
        results.append(self._eval_additives(bundle, ing_field, data))
        results.append(self._eval_veg_mark(bundle))
        return results

    def _base(self, rule_id: str, **kw) -> RuleResult:
        r = self._rule(rule_id)
        return RuleResult(
            rule_id=rule_id,
            rule_family=RuleFamily.FSSR_2020,
            title=r.get("title"),
            source_rule=r.get("source_rule"),
            severity=r.get("severity"),
            **kw,
        )

    # ---------------- Reg 5(2): list present ----------------
    def _eval_list(self, bundle, field, data, commodity_type) -> RuleResult:
        rid = "FSSR_2020_INGREDIENTS_LIST"
        expected = "A list of ingredients under the heading 'Ingredients'."

        if not bundle.has_text():
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.0,
                expected_value=expected, source=EvidenceSource.NONE,
                explanation="No readable text was extracted from the package image, so the ingredient declaration could not be assessed.",
            )

        if data and data.get("ingredients"):
            items = data["ingredients"]
            return self._base(
                rid, status=VerificationStatus.COMPLIANT,
                confidence=round(min(0.97, 0.6 + 0.35 * min(1.0, len(items) / 4.0)) * max(0.5, bundle.ocr.average_confidence), 3),
                extracted_value=[i["name"] for i in items],
                expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(
                    source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                    confidence=bundle.ocr.average_confidence,
                    note=f"{len(items)} ingredient(s) parsed from the declared block.",
                )],
                explanation=f"An ingredients declaration was found listing {len(items)} ingredient(s), satisfying Regulation 5(2).",
            )

        if commodity_type in SINGLE_INGREDIENT_COMMODITIES:
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.4,
                expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, confidence=bundle.ocr.average_confidence,
                                      note="No ingredients heading detected in OCR text.")],
                explanation=(
                    f"No ingredients list was detected. Commodity '{commodity_type}' may qualify as a single-ingredient "
                    "food exempt under Regulation 5(2); officer confirmation required."
                ),
            )

        return self._base(
            rid, status=VerificationStatus.VIOLATION,
            confidence=round(0.55 + 0.35 * min(1.0, bundle.ocr.average_confidence), 3),
            extracted_value=None, expected_value=expected, source=EvidenceSource.OCR,
            evidence=[EvidenceRef(source=EvidenceSource.OCR, confidence=bundle.ocr.average_confidence,
                                  note=f"{bundle.ocr.token_count} text region(s) read; no 'Ingredients' heading present.")],
            explanation="Text was readable but no ingredients declaration was found, contrary to Regulation 5(2).",
        )

    # ---------------- Reg 5(2)(a): descending order ----------------
    def _eval_order(self, bundle, field, data) -> RuleResult:
        rid = "FSSR_2020_INGREDIENTS_ORDER"
        expected = "Ingredients listed in descending order of composition by weight/volume."

        if not data or not data.get("ingredients"):
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.0,
                expected_value=expected, source=EvidenceSource.NONE,
                explanation="No ingredient list was available, so composition order could not be assessed.",
            )

        pcts = [(i["order"], i["name"], i["percentage"]) for i in data["ingredients"] if i.get("percentage") is not None]
        if len(pcts) < 2:
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.3,
                extracted_value=[i["name"] for i in data["ingredients"]],
                expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                      confidence=bundle.ocr.average_confidence,
                                      note="Fewer than two percentage declarations available.")],
                explanation=(
                    "Descending order cannot be verified from the label alone: the declaration does not carry enough "
                    "percentage figures. Physical verification against the manufacturing record is required."
                ),
            )

        seq = [p[2] for p in pcts]
        violations = [
            f"'{pcts[i][1]}' ({seq[i]}%) precedes '{pcts[i + 1][1]}' ({seq[i + 1]}%)"
            for i in range(len(seq) - 1) if seq[i] < seq[i + 1] - 0.001
        ]
        if violations:
            return self._base(
                rid, status=VerificationStatus.VIOLATION, confidence=0.85,
                extracted_value=[{"name": n, "percentage": p} for _, n, p in pcts],
                expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                      confidence=bundle.ocr.average_confidence, note="; ".join(violations))],
                explanation="Declared percentages are not in descending order: " + "; ".join(violations) + ".",
            )

        return self._base(
            rid, status=VerificationStatus.COMPLIANT, confidence=0.82,
            extracted_value=[{"name": n, "percentage": p} for _, n, p in pcts],
            expected_value=expected, source=EvidenceSource.OCR,
            evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                  confidence=bundle.ocr.average_confidence,
                                  note=f"{len(pcts)} percentage declarations in non-increasing order.")],
            explanation="All declared ingredient percentages appear in descending order, consistent with Regulation 5(2)(a).",
        )

    # ---------------- Reg 5(4): allergens ----------------
    def _eval_allergens(self, bundle, field, data) -> RuleResult:
        rid = "FSSR_2020_ALLERGEN_DECLARATION"
        expected = "Major allergens present in the food declared on the label."

        if not data or not data.get("ingredients"):
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.0,
                expected_value=expected, source=EvidenceSource.NONE,
                explanation="No ingredient list was available, so allergen declarations could not be assessed.",
            )

        allergens = data.get("allergens") or []
        statement = data.get("allergen_statement")

        if not allergens:
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.35,
                extracted_value=[], expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                      confidence=bundle.ocr.average_confidence,
                                      note="No allergen keywords matched in the declared ingredients.")],
                explanation=(
                    "No major allergens were recognised in the ingredient list. Absence of a keyword match is not proof "
                    "of absence, so this requires officer confirmation."
                ),
            )

        names = [a["category"] for a in allergens]
        if statement:
            return self._base(
                rid, status=VerificationStatus.COMPLIANT, confidence=0.8,
                extracted_value=names, expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=statement[:300],
                                      confidence=bundle.ocr.average_confidence,
                                      note=f"Allergen categories detected: {', '.join(names)}.")],
                explanation=(
                    f"Allergenic ingredients ({', '.join(names)}) are present and an explicit allergen statement "
                    f"was found: \"{statement[:120]}\"."
                ),
            )

        return self._base(
            rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.5,
            extracted_value=names, expected_value=expected, source=EvidenceSource.OCR,
            evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                  confidence=bundle.ocr.average_confidence,
                                  note=f"Allergens in ingredients: {', '.join(names)}; no separate 'Contains' statement located.")],
            explanation=(
                f"Allergenic ingredients ({', '.join(names)}) appear in the list, but no distinct allergen "
                "declaration was located. Regulation 5(4) permits declaration within the list, so officer review is required."
            ),
        )

    # ---------------- Reg 5(2)(f): additives ----------------
    def _eval_additives(self, bundle, field, data) -> RuleResult:
        rid = "FSSR_2020_ADDITIVES_INS"
        expected = "Additives declared by class name with specific name or INS number."

        if not data or not data.get("ingredients"):
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.0,
                expected_value=expected, source=EvidenceSource.NONE,
                explanation="No ingredient list was available, so additive declarations could not be assessed.",
            )

        additives = data.get("additives") or []
        if not additives:
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.3,
                extracted_value=[], expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                      confidence=bundle.ocr.average_confidence,
                                      note="No INS codes or additive class names matched.")],
                explanation=(
                    "No food additives were detected in the declaration. If the product genuinely contains none this is "
                    "acceptable, but absence cannot be confirmed from the label alone."
                ),
            )

        ins = [a for a in additives if a["type"] == "INS"]
        classes = [a for a in additives if a["type"] == "CLASS_NAME"]

        if ins and classes:
            return self._base(
                rid, status=VerificationStatus.COMPLIANT, confidence=0.85,
                extracted_value={"ins_numbers": [a["code"] for a in ins], "class_names": [a["raw"] for a in classes]},
                expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                      confidence=bundle.ocr.average_confidence,
                                      note=f"{len(classes)} class name(s) with {len(ins)} INS number(s).")],
                explanation=(
                    f"Additives are declared with both class names ({', '.join(a['raw'] for a in classes[:4])}) and "
                    f"INS numbers ({', '.join(a['code'] for a in ins[:6])}), satisfying Regulation 5(2)(f)."
                ),
            )

        if ins and not classes:
            return self._base(
                rid, status=VerificationStatus.VIOLATION, confidence=0.7,
                extracted_value={"ins_numbers": [a["code"] for a in ins], "class_names": []},
                expected_value=expected, source=EvidenceSource.OCR,
                evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                      confidence=bundle.ocr.average_confidence,
                                      note=f"INS numbers without class names: {', '.join(a['code'] for a in ins[:6])}.")],
                explanation=(
                    f"INS numbers ({', '.join(a['code'] for a in ins[:6])}) are declared without the required class name "
                    "(e.g. 'Preservative', 'Acidity Regulator'), contrary to Regulation 5(2)(f)."
                ),
            )

        return self._base(
            rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.45,
            extracted_value={"ins_numbers": [], "class_names": [a["raw"] for a in classes]},
            expected_value=expected, source=EvidenceSource.OCR,
            evidence=[EvidenceRef(source=EvidenceSource.OCR, text_snippet=(data.get("raw_block") or "")[:300],
                                  confidence=bundle.ocr.average_confidence,
                                  note=f"Class names without INS codes: {', '.join(a['raw'] for a in classes[:4])}.")],
            explanation=(
                f"Additive class names ({', '.join(a['raw'] for a in classes[:4])}) were found without an accompanying "
                "INS number or specific name. The specific name may be present but unreadable; officer review required."
            ),
        )

    # ---------------- Reg 5(1)(iii): veg/non-veg symbol ----------------
    def _eval_veg_mark(self, bundle: EvidenceBundle) -> RuleResult:
        rid = "FSSR_2020_VEG_NONVEG_MARK"
        expected = "Green circle-in-square (vegetarian) or brown triangle-in-square (non-vegetarian) on the display panel."
        f = bundle.field("veg_nonveg_mark")

        if not f.found:
            note = f.notes or "Symbol not detected."
            if not bundle.vlm.available:
                note += f" VLM unavailable: {bundle.vlm.error or 'not configured'}."
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=0.0,
                expected_value=expected, source=EvidenceSource.NONE,
                evidence=[EvidenceRef(source=EvidenceSource.VLM, confidence=0.0, note=note)],
                explanation=(
                    "The vegetarian/non-vegetarian mark could not be located visually or in text. "
                    "Absence of detection is not proof of absence, so this is reported as unable_to_verify."
                ),
            )

        if f.conflict:
            return self._base(
                rid, status=VerificationStatus.UNABLE_TO_VERIFY, confidence=round(f.confidence, 3),
                extracted_value=f.value, expected_value=expected, source=EvidenceSource.FUSION,
                evidence=[EvidenceRef(source=EvidenceSource.FUSION, text_snippet=f.raw_text,
                                      bbox=f.bbox, confidence=f.confidence, note=f.notes)],
                explanation=f"Conflicting evidence for the veg/non-veg mark: {f.notes} Officer adjudication required.",
            )

        label = "vegetarian" if f.value == "vegetarian" else "non-vegetarian"
        return self._base(
            rid, status=VerificationStatus.COMPLIANT, confidence=round(f.confidence, 3),
            extracted_value=f.value, expected_value=expected, source=f.source,
            evidence=[EvidenceRef(source=f.source, text_snippet=f.raw_text, bbox=f.bbox,
                                  confidence=f.confidence, note=f.notes)],
            explanation=f"A {label} mark was detected on the package ({f.notes or 'visual detection'}).",
        )


fssr_evaluator = FSSRIngredientEvaluator()
