from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    import app.models.scan  # noqa: F401 - ensure models are registered with Base.metadata
    Base.metadata.create_all(bind=engine)
    _ensure_additive_columns()


def _ensure_additive_columns():
    """
    Add newly introduced nullable columns to pre-existing databases.

    create_all() never alters existing tables, so older scan databases would
    otherwise lack the evidence columns. Adding them in place preserves all
    existing rows and data.
    """
    from sqlalchemy import inspect, text

    required = {
        "scans": {
            "evidence_json": "TEXT",
            "fssr_findings_json": "TEXT",
        }
    }
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        with engine.begin() as conn:
            for table, columns in required.items():
                if table not in existing_tables:
                    continue
                present = {c["name"] for c in inspector.get_columns(table)}
                for column, coltype in columns.items():
                    if column not in present:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
    except Exception as exc:  # pragma: no cover - best-effort migration
        print(f"[DB] Column migration skipped: {exc}")
