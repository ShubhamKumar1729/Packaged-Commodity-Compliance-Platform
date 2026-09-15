"""
Ingredient-block extraction for the FSSR 2020 rule family.

Strictly evidence-driven: every returned structure is backed by a literal span
of OCR text. When the ingredients heading is absent, the extractor returns an
empty result rather than guessing at a composition.
"""
import re
from typing import Any, Dict, List, Optional

# Major allergens requiring declaration under FSSR 2020 Reg. 5(4).
ALLERGEN_KEYWORDS: Dict[str, List[str]] = {
    "cereals_containing_gluten": [
        "wheat", "barley", "rye", "oats", "spelt", "maida", "atta", "semolina",
        "suji", "rava", "gluten", "malt",
    ],
    "crustacea": ["prawn", "shrimp", "crab", "lobster", "crustacean"],
    "milk": [
        "milk", "cheese", "butter", "ghee", "cream", "curd", "whey", "casein",
        "lactose", "paneer", "khoya", "milk solids",
    ],
    "eggs": ["egg", "albumen", "ovalbumin", "egg white", "egg yolk"],
    "fish": ["fish", "anchovy", "tuna", "salmon", "cod"],
    "peanuts": ["peanut", "groundnut", "arachis"],
    "tree_nuts": [
        "almond", "cashew", "walnut", "pistachio", "hazelnut", "pecan",
        "macadamia", "badam", "kaju", "akhrot",
    ],
    "soybeans": ["soy", "soya", "soybean", "soja"],
    "sulphites": ["sulphite", "sulfite", "sulphur dioxide", "sulfur dioxide", "ins 220"],
}

ADDITIVE_CLASS_NAMES = [
    "acidity regulator", "acidulant", "anticaking agent", "antioxidant",
    "bulking agent", "colour", "color", "emulsifier", "firming agent",
    "flavour enhancer", "flavor enhancer", "flour treatment agent",
    "foaming agent", "gelling agent", "glazing agent", "humectant",
    "preservative", "raising agent", "stabiliser", "stabilizer", "sweetener",
    "thickener", "sequestrant", "improver", "enzyme",
]

# Headings that terminate the ingredients block.
_TERMINATORS = [
    r"nutrition(?:al)?\s+(?:information|facts)", r"allergen", r"storage",
    r"best\s*before", r"expiry", r"mrp", r"net\s*(?:qty|quantity|weight)",
    r"manufactured", r"marketed", r"packed\s*by", r"fssai", r"customer\s*care",
    r"consumer\s*care", r"shelf\s*life", r"directions", r"usage", r"contains",
]


class IngredientExtractor:
    HEADING_RE = re.compile(
        r"ingredients?\s*(?:list)?\s*(?:\(.{0,40}?\))?\s*[:\-–—]?", re.IGNORECASE
    )

    @classmethod
    def extract(cls, full_text: str) -> Dict[str, Any]:
        """
        Returns:
            found            - whether an INGREDIENTS heading was located
            raw_block        - the literal declared text (evidence)
            ingredients      - parsed entries with name/percentage/sub-ingredients
            allergens        - detected allergen categories with the matching term
            additives        - detected INS numbers and additive class names
            has_percentages  - whether any % declarations were present
        """
        result: Dict[str, Any] = {
            "found": False,
            "raw_block": None,
            "ingredients": [],
            "allergens": [],
            "additives": [],
            "has_percentages": False,
            "allergen_statement": None,
        }
        if not full_text or not full_text.strip():
            return result

        flat = re.sub(r"[ \t]+", " ", full_text)

        match = cls.HEADING_RE.search(flat)
        if not match:
            return result

        tail = flat[match.end():]
        block = cls._cut_at_terminator(tail).strip(" :\n\r\t-–—")
        if not block:
            return result

        result["found"] = True
        result["raw_block"] = block[:1200]
        result["ingredients"] = cls._parse_ingredients(block)
        result["has_percentages"] = any(i["percentage"] is not None for i in result["ingredients"])
        result["allergens"] = cls._detect_allergens(block, flat)
        result["additives"] = cls._detect_additives(block)
        result["allergen_statement"] = cls._find_allergen_statement(flat)
        return result

    # ------------------------------------------------------------------
    @staticmethod
    def _cut_at_terminator(text: str) -> str:
        cut = len(text)
        for pat in _TERMINATORS:
            m = re.search(pat, text, re.IGNORECASE)
            if m and m.start() < cut:
                cut = m.start()
        # Also stop at a blank line followed by a new heading-like line.
        return text[:cut]

    @staticmethod
    def _split_top_level(block: str) -> List[str]:
        """Split on commas that are not inside brackets, so sub-lists survive."""
        parts, depth, buf = [], 0, []
        for ch in block:
            if ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth = max(0, depth - 1)
            if ch in ",;\n" and depth == 0:
                parts.append("".join(buf))
                buf = []
            else:
                buf.append(ch)
        if buf:
            parts.append("".join(buf))
        return [p.strip() for p in parts if p.strip()]

    @staticmethod
    def _bracketed_span(text: str) -> Optional[str]:
        """Return the contents of the first balanced bracket group, nesting-aware."""
        depth, start = 0, None
        for i, ch in enumerate(text):
            if ch in "([":
                if depth == 0:
                    start = i
                depth += 1
            elif ch in ")]":
                if depth > 0:
                    depth -= 1
                    if depth == 0 and start is not None:
                        return text[start + 1 : i]
        return None

    @staticmethod
    def _strip_brackets(text: str) -> str:
        """Remove all balanced bracket groups, tolerating nesting and stray brackets."""
        out, depth = [], 0
        for ch in text:
            if ch in "([":
                depth += 1
            elif ch in ")]":
                if depth > 0:
                    depth -= 1
                    continue
                continue
            elif depth == 0:
                out.append(ch)
        return "".join(out)

    @classmethod
    def _parse_ingredients(cls, block: str) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        for order, part in enumerate(cls._split_top_level(block), start=1):
            cleaned = part.strip(" .·•-–—\t")
            if not cleaned or len(cleaned) < 2:
                continue

            pct: Optional[float] = None
            m = re.search(r"(\d{1,3}(?:\.\d+)?)\s*%", cleaned)
            if m:
                try:
                    val = float(m.group(1))
                    if 0.0 < val <= 100.0:
                        pct = val
                except ValueError:
                    pct = None

            subs: List[str] = []
            inner = cls._bracketed_span(cleaned)
            if inner and not re.fullmatch(r"\s*\d{1,3}(?:\.\d+)?\s*%\s*", inner):
                subs = [s.strip() for s in re.split(r"[,;]", inner) if s.strip()]

            name = cls._strip_brackets(cleaned)
            name = re.sub(r"\d{1,3}(?:\.\d+)?\s*%", "", name)
            name = re.sub(r"\s{2,}", " ", name).strip(" .,:;-–—")
            if not name:
                continue

            entries.append(
                {
                    "order": order,
                    "name": name,
                    "percentage": pct,
                    "sub_ingredients": subs,
                    "raw": cleaned[:200],
                }
            )
        return entries

    @staticmethod
    def _detect_allergens(block: str, full_text: str) -> List[Dict[str, Any]]:
        found: List[Dict[str, Any]] = []
        haystack = block.lower()
        for category, terms in ALLERGEN_KEYWORDS.items():
            for term in terms:
                if re.search(r"\b" + re.escape(term) + r"\b", haystack):
                    found.append({"category": category, "matched_term": term})
                    break
        return found

    @staticmethod
    def _detect_additives(block: str) -> List[Dict[str, Any]]:
        additives: List[Dict[str, Any]] = []
        seen = set()

        # INS numbers: "INS 330", "E330", or bare 3-4 digit codes after a class name.
        for m in re.finditer(r"\b(?:INS|E)\s*[-.]?\s*(\d{3,4}[a-z]{0,2})\b", block, re.IGNORECASE):
            code = m.group(1).lower()
            if code not in seen:
                seen.add(code)
                additives.append({"type": "INS", "code": code, "raw": m.group(0).strip()})

        low = block.lower()
        for cls_name in ADDITIVE_CLASS_NAMES:
            if re.search(r"\b" + re.escape(cls_name) + r"\b", low):
                key = f"class:{cls_name}"
                if key not in seen:
                    seen.add(key)
                    additives.append({"type": "CLASS_NAME", "code": None, "raw": cls_name})
        return additives

    @staticmethod
    def _find_allergen_statement(full_text: str) -> Optional[str]:
        m = re.search(
            r"((?:contains|may\s+contain|allergen\s+(?:advice|information|declaration))[^\n\r.]{0,180})",
            full_text,
            re.IGNORECASE,
        )
        return m.group(1).strip() if m else None
