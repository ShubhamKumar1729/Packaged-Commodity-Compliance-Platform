import os
import uuid
import json
import hashlib
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.scan import Scan, ReviewLog
from app.schemas.compliance import (
    ComplianceFinding, ComplianceSummary, ReviewRequest, ComplianceStatus
)
from services.ocr.preprocessor import ImagePreprocessor
from services.reports.pdf_generator import pdf_generator

router = APIRouter(tags=["Scans & Inspection"])

@router.post("/scans/upload")
async def upload_scan(
    file: UploadFile = File(...),
    commodity_type: str = Form("FOOD_GRAINS"),
    db: Session = Depends(get_db)
):
    """
    Upload a package image to initiate Legal Metrology compliance inspection.
    Validates image, computes SHA-256, assesses blur/contrast, and registers scan session.
    """
    valid_exts = [".jpg", ".jpeg", ".png", ".webp"]
    ext = os.path.splitext(file.filename or "image.jpg")[1].lower() or ".jpg"
    valid_mimes = ["image/jpeg", "image/png", "image/webp", "image/jpg", "application/octet-stream"]
    if file.content_type not in valid_mimes and ext not in valid_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format '{file.content_type}'. Must be JPEG, PNG, or WebP."
        )

    contents = await file.read()
    if len(contents) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image file exceeds maximum limit of 25MB.")

    sha256_hash = hashlib.sha256(contents).hexdigest()

    try:
        cv_img = ImagePreprocessor.decode_image(contents)
        quality = ImagePreprocessor.assess_quality(cv_img)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image decoding failed: {str(e)}")

    ext = os.path.splitext(file.filename or "image.jpg")[1].lower() or ".jpg"
    scan_uuid = str(uuid.uuid4())
    stored_filename = f"{scan_uuid}{ext}"
    dest_path = settings.UPLOAD_DIR / stored_filename

    with open(dest_path, "wb") as f:
        f.write(contents)

    now = datetime.now(timezone.utc)
    scan_number = f"LM-{now.strftime('%Y%m%d')}-{scan_uuid[:6].upper()}"
    
    try:
        new_scan = Scan(
            id=scan_uuid,
            scan_number=scan_number,
            image_filename=stored_filename,
            image_path=str(dest_path),
            commodity_type=commodity_type,
            status="UPLOADED",
            created_at=now
        )
        db.add(new_scan)
        db.commit()
        db.refresh(new_scan)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record scan in database: {str(e)}")

    return {
        "scan_id": new_scan.id,
        "scan_number": new_scan.scan_number,
        "status": new_scan.status,
        "commodity_type": new_scan.commodity_type,
        "image_url": f"/api/v1/scans/{new_scan.id}/image",
        "sha256_hash": sha256_hash,
        "quality_assessment": quality,
        "created_at": new_scan.created_at.isoformat()
    }

@router.get("/scans")
def list_scans(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    List recent inspection scans with pagination.
    """
    scans = db.query(Scan).order_by(Scan.created_at.desc()).offset(skip).limit(limit).all()
    results = []
    for s in scans:
        results.append({
            "id": s.id,
            "scan_number": s.scan_number,
            "commodity_type": s.commodity_type,
            "status": s.status,
            "overall_verdict": s.overall_verdict,
            "compliance_score": s.compliance_score,
            "created_at": s.created_at.isoformat(),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None
        })
    return {"total": len(results), "scans": results}

@router.get("/scans/{scan_id}")
def get_scan_details(scan_id: str, db: Session = Depends(get_db)):
    """
    Retrieve full details for a specific scan.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    return {
        "id": scan.id,
        "scan_number": scan.scan_number,
        "image_filename": scan.image_filename,
        "image_url": f"/api/v1/scans/{scan.id}/image",
        "annotated_image_url": f"/api/v1/scans/{scan.id}/annotated-image" if scan.annotated_image_path else None,
        "status": scan.status,
        "commodity_type": scan.commodity_type,
        "overall_verdict": scan.overall_verdict,
        "compliance_score": scan.compliance_score,
        "ruleset_version": scan.ruleset_version,
        "ocr_result": json.loads(scan.ocr_json) if scan.ocr_json else None,
        "facts": json.loads(scan.facts_json) if scan.facts_json else None,
        "findings": json.loads(scan.findings_json) if scan.findings_json else [],
        "summary": json.loads(scan.summary_json) if scan.summary_json else None,
        # Additive: OCR+VLM evidence pipeline and FSSR 2020 rule family.
        "evidence": json.loads(scan.evidence_json) if getattr(scan, "evidence_json", None) else None,
        "fssr_findings": json.loads(scan.fssr_findings_json) if getattr(scan, "fssr_findings_json", None) else [],
        "created_at": scan.created_at.isoformat(),
        "completed_at": scan.completed_at.isoformat() if scan.completed_at else None
    }

@router.post("/scans/{scan_id}/analyze")
def analyze_scan(scan_id: str, db: Session = Depends(get_db)):
    """
    Execute end-to-end Legal Metrology verification pipeline:
    OCR -> Structured Facts -> CV Measurements -> Statutory Rule Evaluation -> Scoring -> Visual Evidence Overlay
    """
    from app.services.scan_service import scan_service
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    try:
        ocr_result, facts, findings, summary = scan_service.execute_full_pipeline(scan, db)
        return {
            "scan_id": scan.id,
            "status": scan.status,
            "overall_verdict": summary.overall_verdict.value,
            "compliance_score": summary.compliance_score,
            "tokens_extracted": len(ocr_result.tokens),
            "findings_count": len(findings),
            "ocr_result": ocr_result.model_dump(),
            "facts": facts.model_dump(),
            "findings": [f.model_dump() for f in findings],
            "summary": summary.model_dump(),
            # Additive: evidence bundle + FSSR 2020 family results.
            "evidence": json.loads(scan.evidence_json) if getattr(scan, "evidence_json", None) else None,
            "fssr_findings": json.loads(scan.fssr_findings_json) if getattr(scan, "fssr_findings_json", None) else []
        }
    except HTTPException:
        raise
    except Exception as e:
        from app.services.scan_service import OCRUnavailableError

        if isinstance(e, OCRUnavailableError):
            raise HTTPException(status_code=503, detail=str(e))
        raise HTTPException(status_code=500, detail=f"Analysis pipeline failed: {str(e)}")

@router.post("/scans/{scan_id}/evaluate")
def evaluate_scan(scan_id: str, db: Session = Depends(get_db)):
    """
    Re-evaluates compliance findings from existing extracted facts.
    """
    from app.services.scan_service import scan_service
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    try:
        ocr_result, facts, findings, summary = scan_service.execute_full_pipeline(scan, db)
        return {
            "scan_id": scan.id,
            "overall_verdict": summary.overall_verdict.value,
            "compliance_score": summary.compliance_score,
            "findings": [f.model_dump() for f in findings],
            "summary": summary.model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")

@router.post("/scans/{scan_id}/review")
def review_scan_finding(
    scan_id: str,
    review_req: ReviewRequest,
    db: Session = Depends(get_db)
):
    """
    Officer adjudication endpoint: Overrides or confirms a rule finding,
    records immutable review log, and dynamically recalculates compliance score.
    """
    from app.services.scan_service import scan_service
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    try:
        updated_finding, updated_summary = scan_service.adjudicate_finding(
            scan=scan,
            rule_id=review_req.rule_id,
            updated_status=review_req.status,
            notes=review_req.notes,
            reviewer_name=review_req.reviewer_name or "Enforcement Officer",
            db=db
        )
        return {
            "scan_id": scan.id,
            "rule_id": review_req.rule_id,
            "status": updated_finding.status.value,
            "overall_verdict": updated_summary.overall_verdict.value,
            "compliance_score": updated_summary.compliance_score,
            "updated_finding": updated_finding.model_dump(),
            "updated_summary": updated_summary.model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Adjudication failed: {str(e)}")

@router.get("/scans/{scan_id}/reviews")
def get_scan_reviews(scan_id: str, db: Session = Depends(get_db)):
    """
    Retrieve audit trail of officer adjudications for this scan.
    """
    reviews = db.query(ReviewLog).filter(ReviewLog.scan_id == scan_id).order_by(ReviewLog.reviewed_at.desc()).all()
    return [
        {
            "id": r.id,
            "scan_id": r.scan_id,
            "rule_id": r.rule_id,
            "previous_status": r.previous_status,
            "updated_status": r.updated_status,
            "reviewer_name": r.reviewer_name,
            "review_notes": r.review_notes,
            "reviewed_at": r.reviewed_at.isoformat()
        }
        for r in reviews
    ]

@router.get("/scans/{scan_id}/ocr")
def get_scan_ocr(scan_id: str, db: Session = Depends(get_db)):
    """
    Fetch raw OCR tokens, text, and bounding boxes for visual overlay.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    if not scan.ocr_json:
        raise HTTPException(status_code=400, detail="OCR has not been run for this scan yet. Call /analyze first.")

    return json.loads(scan.ocr_json)

@router.get("/scans/{scan_id}/facts")
def get_scan_facts(scan_id: str, db: Session = Depends(get_db)):
    """
    Fetch structured extracted declarations (ProductFacts).
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    if not scan.facts_json:
        raise HTTPException(status_code=400, detail="Facts have not been extracted for this scan yet. Call /analyze first.")

    return json.loads(scan.facts_json)


@router.get("/scans/{scan_id}/evidence")
def get_scan_evidence(scan_id: str, db: Session = Depends(get_db)):
    """
    Fused OCR + VLM evidence bundle backing every compliance decision.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    if not getattr(scan, "evidence_json", None):
        raise HTTPException(
            status_code=400,
            detail="Evidence has not been generated for this scan yet. Call /analyze first.",
        )

    return json.loads(scan.evidence_json)


@router.get("/scans/{scan_id}/fssr-findings")
def get_scan_fssr_findings(scan_id: str, db: Session = Depends(get_db)):
    """
    FSSR 2020 ingredient rule family results (separate from PCR 2011 findings).
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    return {
        "scan_id": scan.id,
        "rule_family": "FSSR_2020",
        "findings": json.loads(scan.fssr_findings_json) if getattr(scan, "fssr_findings_json", None) else [],
    }

@router.get("/scans/{scan_id}/image")
def get_scan_image(scan_id: str, db: Session = Depends(get_db)):
    """
    Serve the uploaded package image file.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    if not os.path.exists(scan.image_path):
        raise HTTPException(status_code=404, detail="Image file not found on disk")

    return FileResponse(scan.image_path)

@router.get("/scans/{scan_id}/annotated-image")
def get_scan_annotated_image(scan_id: str, db: Session = Depends(get_db)):
    """
    Serve the visual evidence overlay image with color-coded bounding boxes.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    if not scan.annotated_image_path or not os.path.exists(scan.annotated_image_path):
        # Fall back to raw image if annotation is not available
        if os.path.exists(scan.image_path):
            return FileResponse(scan.image_path)
        raise HTTPException(status_code=404, detail="Annotated image not found")

    return FileResponse(scan.annotated_image_path)

@router.get("/scans/{scan_id}/report/pdf")
def download_scan_pdf_report(scan_id: str, db: Session = Depends(get_db)):
    """
    Generate and stream an official, tamper-evident Legal Metrology Compliance Inspection Certificate PDF.
    """
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} not found")

    if not scan.summary_json or not scan.findings_json:
        raise HTTPException(status_code=400, detail="Scan compliance analysis is incomplete. Run /analyze first.")

    summary_dict = json.loads(scan.summary_json)
    findings_list = [ComplianceFinding(**f) for f in json.loads(scan.findings_json)]
    summary = ComplianceSummary(**summary_dict)

    pdf_bytes = pdf_generator.generate(
        scan=scan,
        summary=summary,
        findings=findings_list,
        annotated_image_path=scan.annotated_image_path
    )

    filename = f"Inspection_Certificate_{scan.scan_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={filename}"
        }
    )
