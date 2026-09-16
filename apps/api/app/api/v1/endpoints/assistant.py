"""
Pia - the in-product assistant for PackSure.

Scope is deliberately narrow: Pia answers questions about PackSure itself and
the legal frameworks it enforces (PCR 2011 and FSSR 2020). Anything else is
declined. The scope is enforced in two independent places so that a single
failure does not open the assistant up:

  1. A system prompt that states the boundary and is grounded in the real
     rule data loaded from data/legal/, so Pia cites actual rule ids rather
     than inventing them.
  2. A server-side refusal for inputs that are clearly unrelated, applied
     before any tokens are spent.

This endpoint performs no database writes and does not touch the scan,
OCR/VLM or rule-evaluation pipelines.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings
from services.compliance.registry import rule_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["Assistant"])

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Keep the history bounded: this is a help widget, not a long-form chat.
MAX_HISTORY_MESSAGES = 12
MAX_MESSAGE_CHARS = 1000


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1)


class ChatResponse(BaseModel):
    reply: str
    # True when the reply was produced without calling the model (refusal or
    # configuration problem). Lets the UI style it differently.
    handled_locally: bool = False


# --------------------------------------------------------------- scope guard

# Subjects Pia is explicitly not for. Matched as whole words to avoid
# accidental hits inside legitimate words.
OFF_TOPIC_TERMS = {
    "recipe", "recipes", "cook", "poem", "poetry", "joke", "jokes", "song",
    "lyrics", "story", "novel", "movie", "film", "football", "cricket",
    "horoscope", "astrology", "stock", "stocks", "crypto", "bitcoin",
    "weather", "election", "politics", "dating", "homework", "essay",
    "translate", "javascript", "python", "leetcode", "interview",
}

# Vocabulary that marks a question as in-scope for PackSure.
ON_TOPIC_TERMS = {
    "packsure", "pia", "scan", "scans", "scanning", "upload", "uploaded",
    "image", "photo", "ocr", "paddleocr", "vlm", "compliance", "compliant",
    "violation", "violations", "verification", "verify", "verified", "rule",
    "rules", "pcr", "fssr", "legal", "metrology", "metrology", "declaration",
    "declarations", "mrp", "price", "quantity", "net", "weight", "label",
    "labelling", "labeling", "package", "packaged", "commodity", "manufacturer",
    "packer", "importer", "ingredient", "ingredients", "allergen", "additive",
    "additives", "veg", "nonveg", "non-veg", "fssai", "expiry", "date",
    "manufacture", "score", "verdict", "evidence", "finding", "findings",
    "report", "pdf", "dashboard", "history", "confidence", "font", "height",
    "exemption", "consumer", "care", "contact", "audit", "inspector",
    "inspection", "engine", "provider", "mock", "annotated", "panel", "pdp",
    "unit", "sale", "usp", "tax", "taxes", "review", "officer", "severity",
    "use", "using", "how", "what", "why", "where", "which", "help", "work",
    "works", "mean", "means", "do", "does", "start", "started", "app",
    "platform", "tool", "feature", "page", "button", "tab", "result",
    "results", "status", "error", "fail", "failed", "pass",
}


def _tokenize(text: str) -> set[str]:
    cleaned = "".join(ch.lower() if (ch.isalnum() or ch == "-") else " " for ch in text)
    return {t for t in cleaned.split() if t}


# Subjects with no plausible PackSure reading, so they are refused even when
# the message also contains in-scope vocabulary ("bitcoin price" contains
# "price", which is legitimate for MRP questions).
HARD_OFF_TOPIC_TERMS = {
    "bitcoin", "crypto", "cryptocurrency", "horoscope", "astrology",
    "poem", "poetry", "lyrics", "joke", "jokes", "recipe", "recipes",
}


def is_clearly_off_topic(text: str) -> bool:
    """
    Conservative pre-filter. A message is refused when it names a subject with
    no plausible PackSure reading, or when it names a softer off-topic subject
    and contains no PackSure vocabulary at all. Legitimate questions are never
    blocked by a single unlucky word.
    """
    tokens = _tokenize(text)
    if not tokens:
        return False
    if tokens & HARD_OFF_TOPIC_TERMS:
        return True
    if tokens & ON_TOPIC_TERMS:
        return False
    return bool(tokens & OFF_TOPIC_TERMS)


REFUSAL = (
    "I can only help with PackSure — scanning packages, reading results, and "
    "the PCR 2011 and FSSR 2020 rules it checks. Ask me something about that "
    "and I'll be glad to help."
)


# ------------------------------------------------------------ system prompt

@lru_cache(maxsize=1)
def _rule_digest() -> str:
    """
    A compact catalogue of the real rules, so Pia grounds answers in the rules
    this deployment actually enforces instead of recalling them from training.
    Cached: the registry is static for the process lifetime.
    """
    lines: List[str] = []
    try:
        for rule in rule_registry.get_active_rules():
            source = getattr(rule, "source_rule", "") or ""
            title = getattr(rule, "title", "") or ""
            rid = getattr(rule, "rule_id", "") or ""
            if title:
                lines.append(f"- {source} ({rid}): {title}")
    except Exception as exc:  # never let the help widget break on rule loading
        logger.warning("Pia could not read the rule registry: %s", exc)

    try:
        # FSSR rules are a separate family, served as plain dicts by the
        # evaluator rather than by the PCR registry.
        from services.compliance.fssr_evaluator import fssr_evaluator

        for rule in fssr_evaluator.get_rules():
            source = rule.get("source_rule", "")
            title = rule.get("title", "")
            rid = rule.get("rule_id", "")
            if title:
                lines.append(f"- FSSR {source} ({rid}): {title}")
    except Exception as exc:
        logger.warning("Pia could not read the FSSR rules: %s", exc)

    return "\n".join(lines) if lines else "(rule catalogue unavailable)"


def build_system_prompt() -> str:
    return f"""You are Pia, the built-in assistant for PackSure, a Legal Metrology \
compliance platform used by inspectors and packers in India.

STRICT SCOPE. You only answer questions about:
  - How to use PackSure (scanning a package, uploading photos, reading a
    compliance result, the dashboard, history, rules pages, PDF reports).
  - How PackSure works (OCR text extraction, the visual/VLM checks, the
    deterministic rule engine, compliance scores, verdicts, evidence).
  - The legal rules PackSure enforces: the Legal Metrology (Packaged
    Commodities) Rules 2011 as amended 2023, and FSSR 2020 labelling rules.

If asked about anything outside that scope - general knowledge, coding,
news, entertainment, personal advice, other products - politely decline in
one short sentence and offer to help with PackSure instead. Do not answer
the off-topic question even partially.

HOW PACKSURE WORKS (use this, do not invent mechanisms):
  - The user uploads a photo of a package label, then runs an analysis.
  - An OCR engine (PaddleOCR by default) extracts text from the image. A
    local visual analyser (VLM) checks visual features such as the
    veg/non-veg mark and text layout.
  - Extracted facts are then judged by a deterministic rule engine. AI only
    extracts and measures; the rules decide compliance. Scores are computed
    from rule outcomes, never guessed.
  - Each rule finding is Compliant, a Violation, or Needs verification.
    "Needs verification" means the evidence was missing or too weak to
    decide - it is never treated as compliant.
  - Rule 7 (minimum character height) almost always needs physical officer
    measurement, because a photo has no calibrated reference scale.

RULES THIS DEPLOYMENT ENFORCES:
{_rule_digest()}

STYLE:
  - Warm, brief and practical. Two to four sentences typically; short bullet
    lists when steps genuinely help.
  - Plain language for inspectors, not engineers. No raw stack traces, file
    paths, environment variables or code unless the user explicitly asks.
  - Cite the rule number (for example "Rule 6(1)(e)") when it is relevant.
  - Never invent a scan result, score, statistic or rule that is not real. If
    you do not know something about the user's specific scan, say so and tell
    them where in the interface to look.
"""


# ------------------------------------------------------------------- route

@router.get("/status")
def assistant_status():
    """Lets the UI hide or explain the widget when Pia is not configured."""
    return {
        "enabled": bool(settings.GROQ_API_KEY),
        "model": settings.GROQ_MODEL,
        "name": "Pia",
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    if not settings.GROQ_API_KEY:
        return ChatResponse(
            reply=(
                "I'm not switched on yet. Add a GROQ_API_KEY to the .env file "
                "and restart the API server, and I'll be right here."
            ),
            handled_locally=True,
        )

    latest = payload.messages[-1]
    if latest.role == "user" and is_clearly_off_topic(latest.content):
        return ChatResponse(reply=REFUSAL, handled_locally=True)

    history = payload.messages[-MAX_HISTORY_MESSAGES:]
    body = {
        "model": settings.GROQ_MODEL,
        "messages": [{"role": "system", "content": build_system_prompt()}]
                    + [{"role": m.role, "content": m.content} for m in history],
        "temperature": 0.3,
        "max_tokens": 600,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                GROQ_URL,
                json=body,
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.TimeoutException:
        return ChatResponse(
            reply="That took too long to come back. Could you ask me again?",
            handled_locally=True,
        )
    except httpx.HTTPError as exc:
        logger.warning("Pia could not reach Groq: %s", exc)
        return ChatResponse(
            reply="I can't reach my language service right now. Please try again shortly.",
            handled_locally=True,
        )

    if res.status_code in (401, 403):
        logger.warning("Groq rejected the credentials (%s): %s", res.status_code, res.text[:500])
        return ChatResponse(
            reply=(
                "My API key was rejected. Check GROQ_API_KEY in the .env file, "
                "and make sure the API server was restarted after it changed."
            ),
            handled_locally=True,
        )

    if res.status_code == 404:
        # Almost always a decommissioned or misspelled model name, which is
        # easy to mistake for an auth problem.
        logger.warning("Groq rejected the model %r: %s", settings.GROQ_MODEL, res.text[:500])
        return ChatResponse(
            reply=(
                f"The model '{settings.GROQ_MODEL}' isn't available on this account. "
                "Set GROQ_MODEL in .env to a current Groq model and restart the server."
            ),
            handled_locally=True,
        )

    if res.status_code == 400:
        detail = ""
        try:
            detail = res.json().get("error", {}).get("message", "")
        except ValueError:
            pass
        logger.warning("Groq rejected the request: %s", res.text[:500])
        return ChatResponse(
            reply=detail or "My language service rejected that request. Please try again.",
            handled_locally=True,
        )
    if res.status_code == 429:
        return ChatResponse(
            reply="I'm being rate-limited at the moment. Give me a few seconds and try again.",
            handled_locally=True,
        )
    if res.status_code >= 400:
        # Deliberately not surfacing the upstream body to the user.
        logger.warning("Groq error %s: %s", res.status_code, res.text[:500])
        return ChatResponse(
            reply="Something went wrong on my side. Please try that again.",
            handled_locally=True,
        )

    try:
        reply = res.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, ValueError) as exc:
        logger.warning("Unexpected Groq response shape: %s", exc)
        return ChatResponse(
            reply="I got a reply I couldn't read. Please try again.",
            handled_locally=True,
        )

    return ChatResponse(reply=reply or REFUSAL)
