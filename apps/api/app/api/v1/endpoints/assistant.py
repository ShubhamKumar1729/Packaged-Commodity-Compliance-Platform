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

import json
import logging
import os
from functools import lru_cache
from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT, settings
from app.core.database import get_db
from app.models.scan import Scan
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
    # When the user is viewing an inspection, the UI passes its id so Pia can
    # answer about that specific record instead of talking in generalities.
    scan_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    # True when the reply was produced without calling the model (refusal or
    # configuration problem). Lets the UI style it differently.
    handled_locally: bool = False


def _model_in_dotenv() -> bool:
    """True when a .env beside the repo root actually declares GROQ_MODEL."""
    try:
        env_path = REPO_ROOT / ".env"
        if not env_path.is_file():
            return False
        for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            if stripped.split("=", 1)[0].strip() == "GROQ_MODEL":
                return True
    except OSError:
        pass
    return False


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


# ------------------------------------------------------- scan context

# Status labels as they appear in the interface, so Pia's wording matches what
# the user is looking at rather than the raw database values.
_PCR_STATUS_LABEL = {
    "PASS": "Compliant",
    "FAIL": "Violation",
    "REVIEW_REQUIRED": "Needs verification",
    "NOT_APPLICABLE": "Not applicable",
}
_FSSR_STATUS_LABEL = {
    "compliant": "Compliant",
    "violation": "Violation",
    "unable_to_verify": "Needs verification",
}


def build_scan_context(scan: Scan) -> str:
    """
    Render one stored inspection as plain text for the model.

    Everything here is read from the saved record. Nothing is inferred or
    recomputed, so Pia can only repeat findings the rule engine already made.
    """
    lines: List[str] = []
    add = lines.append

    add("THE INSPECTION THE USER IS CURRENTLY VIEWING")
    add(f"Reference: {scan.scan_number}")
    add(f"Commodity type: {scan.commodity_type}")
    add(f"Stage: {scan.status}")
    add(f"Ruleset: {scan.ruleset_version}")
    if scan.created_at:
        add(f"Scanned: {scan.created_at.isoformat()}")

    verdict_label = _PCR_STATUS_LABEL.get(scan.overall_verdict or "", scan.overall_verdict)
    if scan.overall_verdict:
        add(f"Overall verdict: {scan.overall_verdict} ({verdict_label})")
    if scan.compliance_score is not None:
        add(f"Compliance score: {scan.compliance_score}%")

    def _load(raw, default):
        if not raw:
            return default
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return default

    summary = _load(scan.summary_json, None)
    if isinstance(summary, dict):
        add(
            "Totals: "
            f"{summary.get('total_checks', '?')} checks, "
            f"{summary.get('pass_count', 0)} compliant, "
            f"{summary.get('fail_count', 0)} violations, "
            f"{summary.get('review_count', 0)} need verification, "
            f"{summary.get('not_applicable_count', 0)} not applicable"
        )

    # Which engine produced the text. Pia must not present simulated output
    # as a real inspection.
    evidence = _load(scan.evidence_json, None)
    if isinstance(evidence, dict):
        ocr_ev = evidence.get("ocr") or {}
        provider = ocr_ev.get("provider")
        if provider:
            add(f"OCR engine used: {provider}")
            if str(provider).lower() == "mock":
                add(
                    "  WARNING: this is the MOCK engine. The text below is fixed "
                    "sample data and does NOT describe the user's package. Say so "
                    "clearly if asked about the product details."
                )
        if ocr_ev.get("token_count") is not None:
            add(f"OCR tokens read: {ocr_ev.get('token_count')}")
        if ocr_ev.get("mean_confidence") is not None:
            add(f"OCR mean confidence: {ocr_ev.get('mean_confidence')}")
        vlm_ev = evidence.get("vlm") or {}
        if vlm_ev.get("observations"):
            add(f"Visual checks performed: {', '.join(map(str, vlm_ev['observations']))}")

    # Extracted declarations, skipping empty and internal diagnostic fields.
    facts = _load(scan.facts_json, None)
    if isinstance(facts, dict):
        skip = {"raw_field_map"}

        def _render_fact(value):
            # Extracted fields are stored as {raw_value, normalized_value,
            # confidence, source, bbox}. Only the human-meaningful parts are
            # worth spending context on.
            if isinstance(value, dict) and "raw_value" in value:
                raw = value.get("raw_value")
                norm = value.get("normalized_value")
                conf = value.get("confidence")
                text = f"{raw}"
                if norm not in (None, "", raw) and not isinstance(norm, dict):
                    text += f" (normalised: {norm})"
                if conf is not None:
                    text += f" [confidence {conf}]"
                return text
            return value

        shown = [
            f"  - {k}: {_render_fact(v)}"
            for k, v in facts.items()
            if k not in skip and v not in (None, "", [], {})
        ]
        if shown:
            add("")
            add("Declarations extracted from the label:")
            lines.extend(shown)

    findings = _load(scan.findings_json, [])
    if isinstance(findings, list) and findings:
        add("")
        add("PCR 2011 rule findings (authoritative - do not re-judge these):")
        for f in findings:
            if not isinstance(f, dict):
                continue
            status = f.get("status", "")
            label = _PCR_STATUS_LABEL.get(status, status)
            add(f"  - {f.get('source_rule', '')} {f.get('title', '')}: {status} ({label})")
            if f.get("detected"):
                add(f"      detected: {f['detected']}")
            if f.get("reasoning"):
                add(f"      reason: {f['reasoning']}")
            if f.get("confidence") is not None:
                add(f"      confidence: {f['confidence']}")

    fssr = _load(scan.fssr_findings_json, [])
    if isinstance(fssr, list) and fssr:
        add("")
        add("FSSR 2020 ingredient/labelling findings:")
        for f in fssr:
            if not isinstance(f, dict):
                continue
            status = f.get("status", "")
            label = _FSSR_STATUS_LABEL.get(status, status)
            add(f"  - {f.get('source_rule', '')} {f.get('title', '')}: {status} ({label})")
            if f.get("extracted_value"):
                add(f"      detected: {f['extracted_value']}")
            if f.get("explanation"):
                add(f"      reason: {f['explanation']}")

    return "\n".join(lines)


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
  - Never invent a scan result, score, statistic or rule that is not real.

USING INSPECTION CONTEXT:
  - If a section titled "THE INSPECTION THE USER IS CURRENTLY VIEWING" appears
    below, it is the real stored record. Answer from it directly and concretely
    - quote the actual verdict, score, rule findings and detected values.
  - Treat those findings as already decided by the rule engine. Report them;
    never re-judge a rule or contradict a recorded status.
  - If the context says the MOCK OCR engine was used, state plainly that the
    product details are simulated sample data and do not describe their package.
  - If a detail genuinely is not in the context, say it is not recorded rather
    than guessing, and point to where in the interface it would appear.
  - With no inspection context, answer generally and suggest opening the scan.
"""


# ------------------------------------------------------------------- route

@router.get("/status")
def assistant_status():
    """Lets the UI hide or explain the widget when Pia is not configured."""
    return {
        "enabled": bool(settings.GROQ_API_KEY),
        "model": settings.GROQ_MODEL,
        "name": "Pia",
        # Whether the model name came from configuration or the built-in
        # default, so a stale process is identifiable without a chat attempt.
        "model_source": (
            "environment" if os.environ.get("GROQ_MODEL")
            else ".env" if _model_in_dotenv()
            else "built-in default"
        ),
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, db: Session = Depends(get_db)) -> ChatResponse:
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
    model = settings.GROQ_MODEL

    # Ground the answer in the record the user is looking at, when there is one.
    system_prompt = build_system_prompt()
    if payload.scan_id:
        scan = db.query(Scan).filter(Scan.id == payload.scan_id).first()
        if scan:
            system_prompt = f"{system_prompt}\n\n{build_scan_context(scan)}"

    body = {
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}]
                    + [{"role": m.role, "content": m.content} for m in history],
        "temperature": 0.3,
        # max_completion_tokens is the current field name and is required by
        # the reasoning models; max_tokens is the deprecated alias.
        "max_completion_tokens": 1200,
    }

    # GPT-OSS models reason before answering, and those reasoning tokens are
    # drawn from the same budget as the reply. Keep the effort low so a short
    # help answer is not truncated, and keep the reasoning out of the reply.
    if "gpt-oss" in model:
        body["reasoning_effort"] = "low"

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
        logger.warning("Groq rejected the model %r: %s", model, res.text[:500])
        # Naming the source matters: a stale server process reports the old
        # built-in default even after .env has been corrected.
        origin = (
            "read from the environment/.env"
            if os.environ.get("GROQ_MODEL") or _model_in_dotenv()
            else "the built-in default, meaning your .env value was NOT read"
        )
        return ChatResponse(
            reply=(
                f"The model '{model}' isn't available on this account. "
                f"That value is {origin}. "
                "Set GROQ_MODEL in .env (for example openai/gpt-oss-120b) and "
                "fully restart the API server."
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
        choice = res.json()["choices"][0]
        reply = (choice["message"].get("content") or "").strip()
        finish = choice.get("finish_reason")
    except (KeyError, IndexError, ValueError) as exc:
        logger.warning("Unexpected Groq response shape: %s", exc)
        return ChatResponse(
            reply="I got a reply I couldn't read. Please try again.",
            handled_locally=True,
        )

    if not reply:
        # A reasoning model can spend the whole budget thinking and return no
        # visible answer. Say so plainly rather than showing an empty bubble.
        logger.warning("Empty content from %s (finish_reason=%s)", model, finish)
        return ChatResponse(
            reply=(
                "I ran out of room before finishing that thought. "
                "Could you ask me something a little more specific?"
            ),
            handled_locally=True,
        )

    return ChatResponse(reply=reply)
