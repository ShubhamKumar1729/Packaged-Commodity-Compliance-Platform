from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import init_db
from app.api.v1.router import api_router
from services.compliance.registry import rule_registry

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[Startup] Initializing Database...")
    init_db()
    print("[Startup] Loading Legal Metrology Rules...")
    ruleset = rule_registry.get_ruleset()
    print(f"[Startup] Loaded {len(ruleset.rules)} rules under {ruleset.ruleset_version}")

    # Make the active perception configuration impossible to miss: a server
    # silently running the mock engine returns fabricated label text.
    provider = (settings.OCR_PROVIDER or "").lower()
    if provider == "mock":
        print("=" * 70)
        print("[Startup] WARNING: OCR_PROVIDER=mock")
        print("[Startup] Scan results will be FABRICATED SAMPLE TEXT, not your")
        print("[Startup] uploaded image. Set OCR_PROVIDER=paddleocr for real OCR.")
        print("=" * 70)
    else:
        print(f"[Startup] OCR provider: {settings.OCR_PROVIDER} | "
              f"VLM: {settings.VLM_PROVIDER} | "
              f"mock fallback: {settings.OCR_ALLOW_MOCK_FALLBACK}")
    yield
    # Shutdown
    print("[Shutdown] Cleaning up resources...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Automated compliance verification of Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011.",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root health check
@app.get("/health", tags=["Root"])
def root_health():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

# Mount static storage for evidence and uploads
app.mount("/storage", StaticFiles(directory=str(settings.STORAGE_DIR)), name="storage")

# Include API v1 Router
app.include_router(api_router, prefix=settings.API_V1_STR)
