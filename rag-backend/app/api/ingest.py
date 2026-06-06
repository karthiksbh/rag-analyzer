import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session

from app.core import rag
from app.core.auth import get_current_user
from app.core.celery import celery
from app.core.tasks import ingest_document
from app.core.settings import settings
from app.db.session import get_db
from app.db.models import Document, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", status_code=202)
async def ingest_doc(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {settings.ALLOWED_EXTENSIONS}")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Duplicate check — same filename already indexed for this user
    existing = db.query(Document).filter(
        Document.user_id == user.id,
        Document.filename == file.filename,
    ).first()

    if existing:
        logger.warning(f"[ingest] Duplicate upload blocked — user_id={user.id} file='{file.filename}'")
        raise HTTPException(
            status_code=409,
            detail=f"'{file.filename}' is already indexed. Delete it first if you want to re-upload.",
        )

    logger.info(f"[ingest] Received upload — user_id={user.id} file='{file.filename}' size={len(file_bytes)} bytes")

    task = ingest_document.delay(list(file_bytes), file.filename, user.id)

    logger.info(f"[ingest] Background task queued — task_id={task.id} file='{file.filename}' user_id={user.id}")

    return {
        "message": "Upload received. Processing in background — you'll be notified when ready.",
        "filename": file.filename,
        "task_id": task.id,
    }


@router.get("/status/{task_id}")
async def ingest_status(task_id: str, user: User = Depends(get_current_user)):
    task     = celery.AsyncResult(task_id)
    response = {"task_id": task_id, "status": task.status}

    if task.status in ("STARTED", "PROGRESS"):
        response["detail"] = task.info
    elif task.status == "SUCCESS":
        response["result"] = task.result
    elif task.status == "FAILURE":
        response["error"] = str(task.result)

    return response