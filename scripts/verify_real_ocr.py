"""Prove what the OCR engine actually reads from a given image.

Bypasses the API, the database and every stored scan record, so the output
reflects only the engine and the file you point it at.

Usage (from the repo root):
    python scripts/verify_real_ocr.py path\to\your-image.jpg
"""
import os
import sys

sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("apps/api"))

if len(sys.argv) < 2:
    print("Usage: python scripts/verify_real_ocr.py <image-path>")
    sys.exit(64)

image_path = sys.argv[1]
if not os.path.exists(image_path):
    print(f"ERROR: no such file: {image_path}")
    sys.exit(66)

from app.core.config import settings  # noqa: E402
from services.ocr import get_ocr_engine_safe  # noqa: E402

print("=" * 66)
print("PackSure - direct OCR verification")
print("=" * 66)
print(f"Image                   : {image_path}")
print(f"Effective OCR_PROVIDER  : {settings.OCR_PROVIDER}")
print(f"OCR_ALLOW_MOCK_FALLBACK : {settings.OCR_ALLOW_MOCK_FALLBACK}")
print("-" * 66)

engine, provider, error = get_ocr_engine_safe()
if engine is None:
    print(f"ENGINE UNAVAILABLE: {provider} -> {error}")
    sys.exit(2)

print(f"Engine in use           : {provider}")
if provider == "mock":
    print()
    print("!!! MOCK ENGINE - the text below is FABRICATED sample data")
    print("!!! and has nothing to do with your image.")

with open(image_path, "rb") as fh:
    image_bytes = fh.read()

print(f"Image size              : {len(image_bytes):,} bytes")
print("Running OCR (first real run loads model weights)...")
print("-" * 66)

result = engine.extract(image_bytes)

print(f"Tokens extracted        : {len(result.tokens)}")
print(f"Average confidence      : {result.average_confidence}")
print(f"Image dimensions        : {result.image_width} x {result.image_height}")
print("-" * 66)
print("EXTRACTED TEXT:")
print("-" * 66)
print(result.full_text or "(no text extracted)")
print("-" * 66)

text_upper = (result.full_text or "").upper()
if "ROYAL BASMATI" in text_upper or "HIMALAYAN FOODS" in text_upper:
    print("VERDICT: This is the MOCK sample text, not your image.")
    sys.exit(3)

print("VERDICT: Text was read from your image by the real engine.")
