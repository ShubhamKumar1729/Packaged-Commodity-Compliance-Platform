"""Report which OCR engine the API will actually use, and why.

Run from the repo root:
    python scripts/diagnose_ocr.py
"""
import os
import sys

sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("apps/api"))

from app.core.config import settings  # noqa: E402
from services.ocr import get_ocr_engine_safe  # noqa: E402

print("=" * 62)
print("PackSure OCR diagnostics")
print("=" * 62)

env_override = os.environ.get("OCR_PROVIDER")
print(f"OCR_PROVIDER shell env var : {env_override or '(not set)'}")

dotenv = os.path.join(os.getcwd(), ".env")
if os.path.exists(dotenv):
    print(f".env file                  : FOUND at {dotenv}")
    for line in open(dotenv, encoding="utf-8", errors="replace"):
        s = line.strip()
        if s.startswith(("OCR_", "VLM_", "PADDLE_")):
            print(f"    {s}")
else:
    print(".env file                  : (none)")

print(f"Effective OCR_PROVIDER     : {settings.OCR_PROVIDER}")
print(f"OCR_ALLOW_MOCK_FALLBACK    : {settings.OCR_ALLOW_MOCK_FALLBACK}")
print(f"VLM_PROVIDER               : {settings.VLM_PROVIDER}")
print("-" * 62)

if settings.OCR_PROVIDER.lower() == "mock":
    print("RESULT: MOCK ENGINE -- results are FABRICATED sample text.")
    print("        Clear the override, then restart the API server.")
    sys.exit(1)

print("Loading the real engine (first run downloads model weights)...")
engine, name, error = get_ocr_engine_safe()

if engine is None:
    print(f"RESULT: '{name}' UNAVAILABLE -> {error}")
    print("        Scans will error rather than return fabricated text.")
    sys.exit(2)

if name == "mock":
    print(f"RESULT: FELL BACK TO MOCK -- fabricated text. Cause: {error}")
    sys.exit(3)

print(f"RESULT: OK -- using '{name}' for real text extraction.")
