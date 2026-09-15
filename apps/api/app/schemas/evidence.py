"""
Structured intermediate representation shared by OCR, VLM and the rule engines.

Nothing in this module may invent data. Every field carries an explicit source
and confidence so that a rule can always answer "where did this come from?".
"""
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class EvidenceSource(str, Enum):
    OCR = "OCR"
    VLM = "VLM"
    CV = "CV"
    FUSION = "FUSION"
    NONE = "NONE"


class RuleFamily(str, Enum):
    PCR_2011 = "PCR_2011"
    FSSR_2020 = "FSSR_2020"


class VerificationStatus(str, Enum):
    """Evidence-centric status vocabulary (lowercase, per spec)."""
    COMPLIANT = "compliant"
    VIOLATION = "violation"
    UNABLE_TO_VERIFY = "unable_to_verify"


class OCREvidence(BaseModel):
    """Real text extracted by the OCR engine."""
    provider: str = "unknown"
    full_text: str = ""
    tokens: List[Dict[str, Any]] = Field(default_factory=list)
    average_confidence: float = 0.0
    token_count: int = 0
    image_width: int = 0
    image_height: int = 0
    available: bool = False
    error: Optional[str] = None


class VLMObservation(BaseModel):
    """A single visual observation asserted by the VLM."""
    attribute: str
    value: Optional[Any] = None
    confidence: float = 0.0
    bbox: Optional[List[float]] = None
    rationale: Optional[str] = None


class VLMEvidence(BaseModel):
    provider: str = "unknown"
    observations: List[VLMObservation] = Field(default_factory=list)
    available: bool = False
    error: Optional[str] = None

    def get(self, attribute: str) -> Optional[VLMObservation]:
        for obs in self.observations:
            if obs.attribute == attribute:
                return obs
        return None


class FusedField(BaseModel):
    """
    One extracted product field, with provenance.
    `value is None` means genuinely not found — never a placeholder.
    """
    field_name: str
    value: Optional[Any] = None
    raw_text: Optional[str] = None
    confidence: float = 0.0
    source: EvidenceSource = EvidenceSource.NONE
    bbox: Optional[List[float]] = None
    corroborated_by: List[EvidenceSource] = Field(default_factory=list)
    conflict: bool = False
    notes: Optional[str] = None

    @property
    def found(self) -> bool:
        return self.value is not None


class EvidenceBundle(BaseModel):
    """The complete evidence package handed to the rule engines."""
    scan_id: Optional[str] = None
    ocr: OCREvidence = Field(default_factory=OCREvidence)
    vlm: VLMEvidence = Field(default_factory=VLMEvidence)
    cv: Dict[str, Any] = Field(default_factory=dict)
    fields: Dict[str, FusedField] = Field(default_factory=dict)

    def field(self, name: str) -> FusedField:
        return self.fields.get(name) or FusedField(field_name=name)

    def has_text(self) -> bool:
        return bool(self.ocr.full_text.strip())


class EvidenceRef(BaseModel):
    """Concrete proof attached to a compliance finding."""
    source: EvidenceSource
    text_snippet: Optional[str] = None
    bbox: Optional[List[float]] = None
    confidence: float = 0.0
    note: Optional[str] = None


class RuleResult(BaseModel):
    """
    Evidence-backed result contract required by the acceptance criteria.
    Kept separate from the legacy ComplianceFinding so existing API
    consumers are unaffected.
    """
    rule_id: str
    rule_family: RuleFamily
    status: VerificationStatus
    confidence: float = 0.0
    extracted_value: Optional[Any] = None
    expected_value: Optional[str] = None
    evidence: List[EvidenceRef] = Field(default_factory=list)
    source: EvidenceSource = EvidenceSource.NONE
    explanation: str = ""
    title: Optional[str] = None
    source_rule: Optional[str] = None
    severity: Optional[str] = None
