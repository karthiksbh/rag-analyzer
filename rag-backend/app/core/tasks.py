import logging

from app.core.celery import celery
from app.core.rag import RAGClassifier
from app.db.session import SessionLocal
from app.db.models import Document

logger = logging.getLogger(__name__)


@celery.task(bind=True, name="ingest_document")
def ingest_document(self, file_bytes_list: list[int], filename: str, user_id: int):
    """
    Background task: chunk → embed → upsert to ChromaDB → save to Postgres.
    file_bytes come in as list[int] because Celery serializes over JSON.
    """
    try:
        self.update_state(state="STARTED", meta={"filename": filename, "step": "extracting text"})

        file_bytes = bytes(file_bytes_list)
        rag = RAGClassifier()

        self.update_state(state="PROGRESS", meta={"filename": filename, "step": "creating embeddings"})
        result = rag.ingest(file_bytes, filename, user_id)

        # Save doc record to Postgres
        db = SessionLocal()
        try:
            doc = Document(user_id=user_id, filename=filename, chunks=result["chunks"])
            db.add(doc)
            db.commit()
        finally:
            db.close()

        logger.info(f"[ingest_document] Done: {filename} — {result['chunks']} chunks for user {user_id}")
        return {"status": "complete", "filename": filename, "chunks": result["chunks"]}

    except Exception as e:
        logger.error(f"[ingest_document] Failed for {filename}: {e}")
        raise