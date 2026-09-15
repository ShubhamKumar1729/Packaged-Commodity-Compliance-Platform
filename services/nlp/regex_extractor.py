import re
from typing import Optional, List, Dict, Any, Tuple
from app.schemas.ocr import OCRResult, OCRToken
from app.schemas.facts import ProductFacts, FactValue
from services.nlp.normalizer import Normalizer
from services.nlp.text_corrector import OCRTextCorrector
from services.nlp.multiline_extractor import MultilineExtractor

class RegexFactExtractor:
    @classmethod
    def extract_facts(cls, ocr_result: OCRResult) -> ProductFacts:
        facts = ProductFacts()

        # Apply OCR text corrections to improve matching
        corrected_full_text = OCRTextCorrector.correct_full_text(ocr_result.full_text)

        # Also correct individual token text
        corrected_tokens = []
        for token in ocr_result.tokens:
            corrected_text = OCRTextCorrector.correct_full_text(token.text)
            corrected_tokens.append(OCRToken(
                text=corrected_text,
                confidence=token.confidence,
                bbox=token.bbox,
                line_number=token.line_number
            ))

        tokens = corrected_tokens
        full_text = corrected_full_text

        # Helper to find token containing pattern and return (raw_match, token)
        def find_in_tokens(pattern: str) -> Optional[Tuple[str, OCRToken]]:
            regex = re.compile(pattern, re.IGNORECASE)
            for t in tokens:
                m = regex.search(t.text)
                if m:
                    return m.group(0), t
            return None

        # -------------------------------------------------------------
        # 1. Rule 6(1)(e) - Maximum Retail Price (MRP) & Taxes
        # -------------------------------------------------------------
        # Enhanced MRP pattern to handle OCR errors and variations
        mrp_patterns = [
            r"(?:MRP|M\.R\.P\.?|M\s*R\s*P|MAX(?:IMUM)?\s*RETAIL\s*PRICE|RETAIL\s*PRICE)\s*[:\-]?\s*(?:Rs\.?|₹)?\s*(\d+(?:[,\.]\d{1,2})?)",
            r"(?:PRICE|Rs\.?|₹)\s*[:\-]?\s*(\d+(?:[,\.]\d{1,2})?)",  # Fallback
        ]

        mrp_value = None
        raw_mrp_snippet = None
        matched_token = None

        for pattern in mrp_patterns:
            mrp_match = re.search(pattern, full_text, re.IGNORECASE)
            if mrp_match:
                raw_mrp_snippet = mrp_match.group(0)
                numeric_val = Normalizer.normalize_currency_amount(raw_mrp_snippet)

                if numeric_val and numeric_val > 0:
                    mrp_value = numeric_val
                    # Locate corresponding token
                    for t in tokens:
                        if re.search(r"MRP|M\.R\.P|RETAIL\s*PRICE|₹|Rs", t.text, re.IGNORECASE):
                            matched_token = t
                            break
                    break

        if mrp_value:
            facts.mrp_value = FactValue(
                raw_value=raw_mrp_snippet,
                normalized_value=mrp_value,
                confidence=matched_token.confidence if matched_token else 0.90,
                source="regex_enhanced",
                bbox=matched_token.bbox if matched_token else None
            )
            facts.mrp_currency = FactValue(
                raw_value="INR",
                normalized_value="INR",
                confidence=0.99,
                source="regex"
            )

        # Inclusive of all taxes check (handle OCR errors)
        tax_patterns = [
            r"(?:incl(?:usive)?\.?\s*(?:of)?\s*(?:all)?\s*taxes?)",
            r"(?:incl\.?\s*of\s*all\s*taxes?)",
            r"(?:\(?\s*inclusive\s*of\s*all\s*taxes?\s*\)?)",
        ]

        for pattern in tax_patterns:
            tax_match = re.search(pattern, full_text, re.IGNORECASE)
            if tax_match:
                facts.inclusive_of_taxes_clause = FactValue(
                    raw_value=tax_match.group(0),
                    normalized_value=True,
                    confidence=0.96,
                    source="regex_enhanced"
                )
                break

        # -------------------------------------------------------------
        # 2. Rule 6(1)(c) - Net Quantity & Units
        # -------------------------------------------------------------
        # Try pattern matching in full text first
        qty_patterns = [
            r"(?:Net\s*(?:Qty|Quantity|Weight|Wt\.?)|Volume)\s*[:\-]?\s*(\d+(?:[,\.]\d+)?)\s*([a-zA-Z]+)",
            r"\bNet\s*[:\-]?\s*(\d+(?:[,\.]\d+)?)\s*(kg|g|gm|gms|ml|l|ltr|litre)\b",
            r"\b(\d+(?:[,\.]\d+)?)\s*(kg|g|gm|gms|ml|l|ltr|litre|meter|cm|mm)\b",
        ]

        qty_value = None
        qty_unit = None
        qty_confidence = 0.92
        qty_source = "regex_enhanced"
        matched_token = None

        for pattern in qty_patterns:
            qty_match = re.search(pattern, full_text, re.IGNORECASE)
            if qty_match:
                qty_value = qty_match.group(1).replace(',', '.')
                qty_unit = qty_match.group(2)
                for t in tokens:
                    if re.search(r"Net|Quantity|Weight|" + re.escape(qty_value), t.text, re.IGNORECASE):
                        matched_token = t
                        break
                break

        # If pattern matching fails, try cross-token extraction (handles split tokens)
        if not qty_value or not qty_unit:
            cross_token_result = MultilineExtractor.extract_quantity_cross_tokens(tokens)
            if cross_token_result:
                qty_value, qty_unit, qty_confidence = cross_token_result
                qty_source = "multiline_enhanced"

        if qty_value and qty_unit:
            norm_qty = Normalizer.normalize_quantity(qty_value, qty_unit)

            if norm_qty["value"] is not None:
                facts.net_quantity_value = FactValue(
                    raw_value=qty_value,
                    normalized_value=norm_qty["base_value"],
                    confidence=qty_confidence if not matched_token else matched_token.confidence,
                    source=qty_source,
                    bbox=matched_token.bbox if matched_token else None
                )
                facts.net_quantity_unit = FactValue(
                    raw_value=qty_unit,
                    normalized_value=norm_qty["base_unit"],
                    confidence=qty_confidence if not matched_token else matched_token.confidence,
                    source=qty_source
                )

        # -------------------------------------------------------------
        # 3. Rule 6(1)(da) - Unit Sale Price (USP)
        # -------------------------------------------------------------
        usp_patterns = [
            r"(?:USP|Unit\s*Sale\s*Price)\s*[:\-]?\s*(?:Rs\.?|₹)?\s*(\d+(?:\.\d{1,2})?)\s*(?:per|\/|each)\s*([a-zA-Z0-9]+)",
            r"Unit\s*[:\-]?\s*(?:Rs\.?|₹)?\s*(\d+(?:\.\d{1,2})?)\s*(?:per|\/)\s*([a-zA-Z0-9]+)",
        ]

        for pattern in usp_patterns:
            usp_match = re.search(pattern, full_text, re.IGNORECASE)
            if usp_match:
                facts.unit_sale_price = FactValue(
                    raw_value=usp_match.group(0),
                    normalized_value={"amount": float(usp_match.group(1)), "unit_basis": usp_match.group(2)},
                    confidence=0.94,
                    source="regex_enhanced"
                )
                break

        # -------------------------------------------------------------
        # 4. Rule 6(1)(d) - Dates (Mfg / Pkd / Expiry / Best Before)
        # -------------------------------------------------------------
        date_patterns = [
            # Allow an intervening "Date"/"Dt" token and flexible punctuation,
            # e.g. "Mfd. Date: 08/2026", "Mfg Dt - 08-2026", "Packed On: 08/2026".
            r"(?:Mfd|Mfg|Manufactured|Packed|Pkd|Date\s*of\s*(?:Pkg|Packaging)|Packaging|Month\s*(?:&|and)?\s*Year\s*of\s*Packaging)[\s\.\-:]*(?:Date|Dt|On)?[\s\.\-:]*([01]?\d\s*[/-]\s*(?:20)?\d{2,4})",
            r"(?:Mfd|Mfg|Manufactured)[\s\.\-:]*(?:Date|Dt|On)?[\s\.\-:]*([01]?\d[-/](?:20)?\d{2,4})",
            # Month-name forms: "Mfd. Date: AUG 2026"
            r"(?:Mfd|Mfg|Manufactured|Packed|Pkd)[\s\.\-:]*(?:Date|Dt|On)?[\s\.\-:]*([a-zA-Z]{3,9}\s+(?:20)?\d{2,4})",
            r"(?:Month|Year)\s*[:\.\-]?\s*(?:of\s*)?(?:Packaging|Mfg)\s*[:\.\-]?\s*([01]?\d\s*/\s*\d{4})",
        ]

        for pattern in date_patterns:
            date_match = re.search(pattern, full_text, re.IGNORECASE)
            if date_match:
                raw_date = date_match.group(1).strip()
                norm_date = Normalizer.normalize_date(raw_date)
                if norm_date:
                    facts.mfg_date = FactValue(
                        raw_value=raw_date,
                        normalized_value=norm_date["iso"] if norm_date else raw_date,
                        confidence=0.94,
                        source="regex_enhanced"
                    )
                    break

        # Best before pattern
        bb_patterns = [
            r"(?:Best\s*Before|Use\s*By|Expiry(?:\s*Date)?|Exp\.?\s*Date?)\s*[:\.]?\s*([^\n\r,]+)",
        ]

        for pattern in bb_patterns:
            bb_match = re.search(pattern, full_text, re.IGNORECASE)
            if bb_match:
                facts.best_before = FactValue(
                    raw_value=bb_match.group(0).strip(),
                    normalized_value=bb_match.group(1).strip(),
                    confidence=0.92,
                    source="regex_enhanced"
                )
                break

        # -------------------------------------------------------------
        # 5. Rule 6(1)(a) - Manufacturer / Packer / Address / Origin
        # -------------------------------------------------------------
        # Use multiline extractor for better accuracy
        company_name, full_address, pincode = MultilineExtractor.extract_manufacturer_info(tokens)

        if company_name:
            facts.manufacturer_name = FactValue(
                raw_value=company_name,
                normalized_value=company_name,
                confidence=0.90,
                source="multiline_enhanced"
            )

        if full_address and pincode:
            facts.manufacturer_address = FactValue(
                raw_value=full_address,
                normalized_value={"pincode": pincode, "full_address": full_address},
                confidence=0.92,
                source="multiline_enhanced"
            )
        elif pincode:
            # Fallback: just pincode
            facts.manufacturer_address = FactValue(
                raw_value=f"Pincode: {pincode}",
                normalized_value={"pincode": pincode, "full_address": ""},
                confidence=0.96,
                source="regex_enhanced"
            )

        # Country of Origin (handle OCR errors like "Countryot" -> "Country of")
        origin_patterns = [
            # Stop at end-of-line so a following declaration is not absorbed.
            # Restrict to a single line and stop at any delimiter, so a following
            # declaration (e.g. "Consumer Care") is not absorbed into the value.
            r"(?:Country\s*of\s*Origin|Countryof\s*Origin|Countryot\s*Origin|Made\s*in)[ \t]*[:\-]?[ \t]*([a-zA-Z][a-zA-Z \t]*[a-zA-Z]|[a-zA-Z])(?=[ \t]*(?:[|,.;:\n\r]|$))",
        ]

        for pattern in origin_patterns:
            origin_match = re.search(pattern, full_text, re.IGNORECASE)
            if origin_match:
                country = origin_match.group(1).strip().title()
                # Clean up: remove trailing punctuation and common OCR artifacts
                country = re.sub(r'[:\-\|]+$', '', country).strip()
                facts.country_of_origin = FactValue(
                    raw_value=origin_match.group(0),
                    normalized_value=country,
                    confidence=0.98,
                    source="regex_enhanced"
                )
                break

        # -------------------------------------------------------------
        # 6. Rule 6(1)(b) - Generic Name
        # -------------------------------------------------------------
        generic_patterns = [
            r"(?:Generic\s*Name|Common\s*Name)\s*[:\-]?\s*([^(\n\r]+)",
            r"Generic\s*Name\s*[:\-]?\s*([^(]+)",
        ]

        for pattern in generic_patterns:
            generic_match = re.search(pattern, full_text, re.IGNORECASE)
            if generic_match:
                gen_name = generic_match.group(1).strip()
                # Remove parenthetical notes like "(Agricultural Produce)"
                gen_name = re.sub(r'\([^)]*\)', '', gen_name).strip()
                facts.generic_name = FactValue(
                    raw_value=gen_name,
                    normalized_value=gen_name,
                    confidence=0.88,
                    source="regex_enhanced"
                )
                break

        # Fallback: Use first prominent token (usually brand/product name)
        if not facts.generic_name and len(tokens) > 1:
            # Skip "MANDATORY" or header tokens, look for actual product name
            for token in tokens[:5]:
                if len(token.text) > 5 and not re.match(r'^(MANDATORY|LEGAL|METROLOGY|DECLARATIONS)$', token.text, re.IGNORECASE):
                    candidate = token.text
                    facts.generic_name = FactValue(
                        raw_value=candidate,
                        normalized_value=candidate,
                        confidence=0.70,
                        source="heuristic"
                    )
                    break

        # -------------------------------------------------------------
        # 7. Rule 6(1)(n) - Consumer Care (Phone, Email, Contact)
        # -------------------------------------------------------------
        # Email (more flexible pattern, handle OCR concatenation)
        email_patterns = [
            r"\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b",
            r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.com)",
            r"\|([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.com)",  # Pipe separator common in OCR
            r"care@([a-zA-Z0-9-]+\.com)",  # Common pattern
        ]

        for pattern in email_patterns:
            email_match = re.search(pattern, full_text, re.IGNORECASE)
            if email_match:
                email = email_match.group(1) if '|' not in pattern and 'care@' not in pattern else (
                    'care@' + email_match.group(1) if 'care@' in pattern else email_match.group(1)
                )
                # Fix common OCR errors in email
                email = email.replace(' ', '').replace('|', '').lower()
                # Handle common OCR errors: Icare -> care, lcare -> care
                email = re.sub(r'^[Il]care@', 'care@', email)

                facts.consumer_care_email = FactValue(
                    raw_value=email,
                    normalized_value=email,
                    confidence=0.95,
                    source="regex_enhanced"
                )
                break

        # Phone / Toll-free
        phone_patterns = [
            r"(?:1800[-\s]?\d{2,3}[-\s]?\d{3,4})",  # Toll-free
            r"(?:\+?91[-\s]?[6-9]\d{9})",  # Indian mobile
            r"(?:0\d{2,4}[-\s]?\d{6,8})",  # Landline
        ]

        for pattern in phone_patterns:
            phone_match = re.search(pattern, full_text, re.IGNORECASE)
            if phone_match:
                phone_num = Normalizer.normalize_phone(phone_match.group(0))
                facts.consumer_care_phone = FactValue(
                    raw_value=phone_match.group(0),
                    normalized_value=phone_num,
                    confidence=0.96,
                    source="regex_enhanced"
                )
                break

        return facts
