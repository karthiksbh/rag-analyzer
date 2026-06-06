import logging
from fastapi import FastAPI
from fastapi import Depends
from sqlalchemy.orm import Session
from app.api import api_router
from sqlalchemy import text
from app.db.session import Base, engine, get_db

from app.core.settings import settings
from app.core.middleware import register_middleware
from app.core.exception import register_exception_handlers

app = FastAPI(
    title="RAG API",
    description="Upload docs, ask questions.",
    version="2.0.0",
)

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

register_middleware(app)
register_exception_handlers(app)

# create tables on startup
Base.metadata.create_all(bind=engine)

app.include_router(api_router)

@app.get("/health")
async def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except:
        db_status = "error"
    return {"status": "ok", "db": db_status}