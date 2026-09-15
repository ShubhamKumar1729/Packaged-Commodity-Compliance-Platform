import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, Text
from app.core.database import Base

class Scan(Base):
    __tablename__ = "scans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_number = Column(String(64), unique=True, index=True, nullable=False)
    image_filename = Column(String(255), nullable=False)
    image_path = Column(String(512), nullable=False)
    annotated_image_path = Column(String(512), nullable=True)
    
    commodity_type = Column(String(64), default="GENERAL_PACKAGED_GOODS", nullable=False)
    status = Column(String(32), default="UPLOADED", nullable=False)
    overall_verdict = Column(String(32), nullable=True)
    compliance_score = Column(Float, nullable=True)
    ruleset_version = Column(String(64), default="PC_RULES_2011_v2023", nullable=False)
    
    ocr_json = Column(Text, nullable=True)
    facts_json = Column(Text, nullable=True)
    findings_json = Column(Text, nullable=True)
    summary_json = Column(Text, nullable=True)

    # Additive columns for the OCR+VLM evidence pipeline and FSSR 2020 family.
    # Nullable so existing rows and API consumers are unaffected.
    evidence_json = Column(Text, nullable=True)
    fssr_findings_json = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

class ReviewLog(Base):
    __tablename__ = "review_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id = Column(String(36), nullable=False, index=True)
    rule_id = Column(String(64), nullable=False)
    previous_status = Column(String(32), nullable=False)
    updated_status = Column(String(32), nullable=False)
    reviewer_name = Column(String(128), default="Officer In-Charge", nullable=False)
    review_notes = Column(Text, nullable=False)
    reviewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
