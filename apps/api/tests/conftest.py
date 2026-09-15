import os
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Ensure root and apps/api are in python path
CURRENT = Path(__file__).resolve()
API_ROOT = CURRENT.parent.parent
ROOT = CURRENT.parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(API_ROOT))

# Isolate the test database BEFORE app modules read settings. Previously the
# suite ran against the development database and dropped its tables on teardown,
# destroying real scan data.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{(ROOT / 'test_legal_metrology.db').as_posix()}")
# Tests must never depend on a real OCR model download.
os.environ.setdefault("OCR_PROVIDER", "mock")
os.environ.setdefault("OCR_ALLOW_MOCK_FALLBACK", "true")

from app.main import app
from app.core.database import Base, engine

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
