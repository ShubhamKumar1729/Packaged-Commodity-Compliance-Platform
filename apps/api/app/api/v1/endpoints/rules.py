from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from services.compliance.registry import rule_registry
from app.schemas.rules import LegalRule, LegalRuleSet

router = APIRouter(tags=["Legal Rules & Master Data"])

@router.get("/rules", response_model=LegalRuleSet)
def get_all_rules():
    """
    Returns the complete active Legal Metrology (Packaged Commodities) Rules, 2011 rule set.
    """
    return rule_registry.get_ruleset()

@router.get("/rules/active", response_model=List[LegalRule])
def get_active_rules():
    """
    Returns the list of currently enforced rules.
    """
    return rule_registry.get_active_rules()

@router.get("/rules/fssr", response_model=List[Dict[str, Any]])
def get_fssr_rules():
    """
    Returns the FSSR 2020 ingredient rule family.

    Declared before /rules/{rule_id} so the static path is not shadowed.
    """
    from services.compliance.fssr_evaluator import fssr_evaluator

    return fssr_evaluator.get_rules()

@router.get("/rules/{rule_id}", response_model=LegalRule)
def get_rule_by_id(rule_id: str):
    """
    Fetches details and verification parameters for a specific Legal Metrology rule.
    """
    rule = rule_registry.get_rule_by_id(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=f"Legal Rule {rule_id} not found")
    return rule

@router.get("/commodities", response_model=List[Dict[str, Any]])
def get_commodities():
    """
    Returns the schedule of regulated packaged commodities.
    """
    return rule_registry.get_commodities()

@router.get("/exemptions", response_model=List[Dict[str, Any]])
def get_exemptions():
    """
    Returns statutory exemptions under Rule 26.
    """
    return rule_registry.get_exemptions()
