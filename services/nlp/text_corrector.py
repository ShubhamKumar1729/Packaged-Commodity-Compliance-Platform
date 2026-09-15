"""
OCR Text Correction Module
Handles common OCR errors and text normalization for Legal Metrology compliance extraction.
"""
import re
from typing import Dict, List, Optional

class OCRTextCorrector:
    """
    Corrects common OCR misrecognitions in packaging text.
    """

    # Common OCR character substitutions
    CHAR_SUBSTITUTIONS = {
        'l': ['I', '1', '|'],  # lowercase L often confused
        'I': ['l', '1', '|'],  # uppercase i
        '1': ['l', 'I', '|'],
        'O': ['0', 'o'],
        '0': ['O', 'o'],
        'S': ['5', 's'],
        '5': ['S', 's'],
        'B': ['8'],
        '8': ['B'],
        'G': ['6'],
        'Z': ['2'],
        't': ['f'],
        'i': ['!', '|'],
    }

    # Common word corrections for Legal Metrology terms
    WORD_CORRECTIONS = {
        # MRP related
        'petail': 'retail',
        'retall': 'retail',
        'relail': 'retail',
        'mrpi': 'mrp',
        'nrp': 'mrp',
        'mrr': 'mrp',

        # Quantity related
        'netquantity': 'net quantity',
        'nel': 'net',
        'quanlity': 'quantity',
        'quantily': 'quantity',

        # Generic terms
        'pgricultural': 'agricultural',
        'agricullural': 'agricultural',
        'produce': 'produce',

        # Company terms
        'lld': 'ltd',
        'pvl': 'pvt',
        'limiled': 'limited',

        # Other common terms
        'ofall': 'of all',
        'oforigin': 'of origin',
        'countryoforigin': 'country of origin',
        'monthsform': 'months from',
        'monthsfrom': 'months from',
        'yearof': 'year of',
        'inclusiveofall': 'inclusive of all',
        'taxesi': 'taxes',
        'uspi': 'usp',
    }

    @classmethod
    def fix_common_errors(cls, text: str) -> str:
        """
        Apply common OCR error corrections.
        """
        if not text:
            return text

        # Convert to lowercase for matching
        lower_text = text.lower()

        # Apply word-level corrections
        for wrong, correct in cls.WORD_CORRECTIONS.items():
            # Case-insensitive replacement preserving original case pattern
            pattern = re.compile(re.escape(wrong), re.IGNORECASE)
            text = pattern.sub(correct, text)

        return text

    @classmethod
    def split_concatenated_words(cls, text: str) -> str:
        """
        Split common concatenated words that OCR missed spaces in.
        """
        # Add space before capital letters in camelCase/PascalCase (but preserve acronyms)
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)

        # Known compound terms that should have spaces
        replacements = [
            (r'\bNetQuantity\b', 'Net Quantity'),
            (r'\bMaximumRetail\b', 'Maximum Retail'),
            (r'\bRetailPrice\b', 'Retail Price'),
            (r'\bBestBefore\b', 'Best Before'),
            (r'\bUnitSale\b', 'Unit Sale'),
            (r'\bSalePrice\b', 'Sale Price'),
            (r'\bCountryof\b', 'Country of'),
            (r'\bMonthof\b', 'Month of'),
            (r'\bYearof\b', 'Year of'),
        ]

        for pattern, replacement in replacements:
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

        return text

    @classmethod
    def normalize_spaces(cls, text: str) -> str:
        """
        Normalize whitespace in text.
        """
        # Collapse runs of spaces/tabs, but PRESERVE line breaks: each OCR line is
        # a separate declaration, and merging them lets one field's regex run on
        # into the next line's text.
        text = re.sub(r'[ \t]+', ' ', text)
        text = re.sub(r'[ \t]*\r?\n[ \t]*', '\n', text)
        # Remove spaces before punctuation
        text = re.sub(r'[ \t]+([,.:;!?)])', r'\1', text)
        # Remove spaces after opening brackets
        text = re.sub(r'([(])\s+', r'\1', text)
        return text.strip()

    @classmethod
    def correct_full_text(cls, text: str) -> str:
        """
        Apply all corrections to the full OCR text.
        """
        text = cls.fix_common_errors(text)
        text = cls.split_concatenated_words(text)
        text = cls.normalize_spaces(text)
        return text

    @classmethod
    def fuzzy_match_keyword(cls, text: str, keywords: List[str], threshold: float = 0.8) -> Optional[str]:
        """
        Find the best matching keyword in text using fuzzy matching.
        Returns the matched keyword or None.
        """
        text_lower = text.lower()

        for keyword in keywords:
            keyword_lower = keyword.lower()

            # Exact match
            if keyword_lower in text_lower:
                return keyword

            # Try with common OCR errors
            for wrong, correct in cls.WORD_CORRECTIONS.items():
                if correct == keyword_lower and wrong in text_lower:
                    return keyword

        return None
