from fastapi import APIRouter
from app.api.v1.endpoints import health, rules, scans, dashboard, assistant

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(rules.router)
api_router.include_router(scans.router)
api_router.include_router(dashboard.router)
api_router.include_router(assistant.router)
