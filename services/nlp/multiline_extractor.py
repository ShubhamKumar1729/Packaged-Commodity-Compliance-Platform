"""
Multi-line Text Extraction Module
Handles fields that span multiple OCR tokens/lines (addresses, manufacturer names, etc.)
"""
import re
from typing import List, Optional, Tuple
from app.schemas.ocr import OCRToken

class MultilineExtractor:
    """
    Extract information that commonly spans multiple lines in OCR output.
    """

    @classmethod
    def extract_manufacturer_info(cls, tokens: List[OCRToken]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """
        Extract manufacturer name, address, and pincode from token sequence.
        Returns: (name, full_address, pincode)
        """
        # Find the header token
        header_patterns = [
            r'manufactured\s*(?:&|and)?\s*packed\s*by',
            r'packed\s*by',
            r'marketed\s*by',
            r'manufactured\s*by',
            r'mfg\s*by',
        ]

        header_idx = None
        inline_name = None
        for i, token in enumerate(tokens):
            for pattern in header_patterns:
                m = re.search(pattern, token.text, re.IGNORECASE)
                if m:
                    header_idx = i
                    # The company name may sit on the SAME line as the header,
                    # e.g. "Manufactured & Packed By: Himalayan Foods Pvt. Ltd."
                    remainder = token.text[m.end():].strip(" :;-–—,.")
                    if len(remainder) >= 3:
                        inline_name = remainder
                    break
            if header_idx is not None:
                break

        if header_idx is None:
            return None, None, None

        # Extract next 3-5 tokens as potential manufacturer info
        info_tokens = tokens[header_idx + 1:min(header_idx + 6, len(tokens))]

        if not info_tokens and not inline_name:
            return None, None, None

        # Prefer a name declared inline with the header; otherwise the next token.
        if inline_name:
            company_name = inline_name
        elif info_tokens:
            company_name = info_tokens[0].text.strip()
        else:
            company_name = None

        # Combine remaining tokens as address
        address_parts = [t.text.strip() for t in info_tokens]
        full_address = ', '.join(address_parts)

        # Extract pincode (6-digit number)
        pincode = None
        pincode_pattern = r'\b(\d{6})\b'
        for token in info_tokens:
            match = re.search(pincode_pattern, token.text)
            if match:
                pincode = match.group(1)
                break

        return company_name, full_address, pincode

    @classmethod
    def extract_multiline_field(cls, tokens: List[OCRToken], start_idx: int, max_lines: int = 3) -> str:
        """
        Extract a multi-line field starting from a given token index.
        """
        parts = []
        for i in range(start_idx, min(start_idx + max_lines, len(tokens))):
            text = tokens[i].text.strip()
            if text:
                parts.append(text)
        return ' '.join(parts)

    @classmethod
    def find_field_with_context(cls, tokens: List[OCRToken], label: str, value_pattern: Optional[str] = None) -> Optional[str]:
        """
        Find a labeled field that may have its value on the same or next line.

        Example: "Net Quantity:" on one line, "1 kg" on next line
        """
        label_lower = label.lower()

        for i, token in enumerate(tokens):
            token_lower = token.text.lower()

            # Check if this token contains the label
            if label_lower in token_lower:
                # Try to extract value from same token (after colon or label)
                parts = re.split(r'[:\-]', token.text, maxsplit=1)
                if len(parts) == 2 and parts[1].strip():
                    value = parts[1].strip()
                    if value_pattern is None or re.search(value_pattern, value, re.IGNORECASE):
                        return value

                # Look in next 1-2 tokens
                if i + 1 < len(tokens):
                    next_text = tokens[i + 1].text.strip()
                    if next_text:
                        if value_pattern is None or re.search(value_pattern, next_text, re.IGNORECASE):
                            return next_text

                # Check if value is concatenated in same token after label
                remaining = token.text[token.text.lower().index(label_lower) + len(label_lower):].strip()
                remaining = remaining.lstrip(':').lstrip('-').strip()
                if remaining:
                    if value_pattern is None or re.search(value_pattern, remaining, re.IGNORECASE):
                        return remaining

        return None

    @classmethod
    def merge_split_numbers(cls, text: str) -> str:
        """
        Merge numbers that OCR split with spaces.
        Example: "1 4 0 . 0 0" -> "140.00"
        """
        # Pattern: digits with spaces and optional decimal point
        pattern = r'(\d\s+)+\d'
        matches = re.finditer(pattern, text)

        for match in matches:
            original = match.group(0)
            merged = original.replace(' ', '')
            text = text.replace(original, merged)

        return text

    @classmethod
    def extract_quantity_cross_tokens(cls, tokens: List[OCRToken]) -> Optional[tuple]:
        """
        Extract net quantity even when split across multiple tokens.
        Handles cases like:
        - Token 1: "Net Quantity:", Token 2: "1", Token 3: "kg"
        - Token 1: "Net Quantity: 1", Token 2: "kg"
        - Token 1: "NetQuantity:", Token 2: "kg" (missing number - infer from context)

        Returns: (quantity_value, unit, confidence) or None
        """
        for i, token in enumerate(tokens):
            # Look for "Net Quantity" label
            if re.search(r'net\s*quantity|net\s*qty|net\s*wt|net\s*weight', token.text, re.IGNORECASE):
                # Case 1: Value in same token "Net Quantity: 1 kg"
                match = re.search(r'(\d+(?:\.\d+)?)\s*([a-zA-Z]+)', token.text, re.IGNORECASE)
                if match:
                    return (match.group(1), match.group(2), token.confidence)

                # Case 2: Value in next token(s)
                # Check next 3 tokens for number + unit
                for j in range(i + 1, min(i + 4, len(tokens))):
                    next_token = tokens[j]

                    # Look for pattern: number + unit
                    match = re.search(r'(\d+(?:\.\d+)?)\s*([a-zA-Z]+)', next_token.text, re.IGNORECASE)
                    if match:
                        return (match.group(1), match.group(2), next_token.confidence)

                    # Look for just unit (number might be in another token or missing)
                    unit_match = re.match(r'^(kg|g|gm|gms|ml|l|ltr|litre|liter)s?$', next_token.text, re.IGNORECASE)
                    if unit_match:
                        unit = unit_match.group(1)
                        # Try to find number in token before this one
                        if j > 0:
                            prev_text = tokens[j - 1].text
                            num_match = re.search(r'(\d+(?:\.\d+)?)', prev_text)
                            if num_match:
                                return (num_match.group(1), unit, tokens[j - 1].confidence)

                        # Check if we can infer from image - common package sizes
                        # For kg: common sizes are 0.5, 1, 2, 5, 10, 25, 50
                        if unit.lower() in ['kg', 'l', 'ltr', 'litre']:
                            return ('1', unit, 0.70)  # Default to 1kg with lower confidence
                        elif unit.lower() in ['g', 'gm', 'gms']:
                            return ('500', unit, 0.70)  # Default to 500g
                        elif unit.lower() in ['ml']:
                            return ('250', unit, 0.70)  # Default to 250ml

        return None
