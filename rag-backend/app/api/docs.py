import logging
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.db.models import Document, User
from app.core import rag

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/embedded-docs", tags=["docs"])


@router.get("")
async def list_docs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all docs belonging to the current user."""
    docs = db.query(Document).filter(Document.user_id == user.id).order_by(Document.uploaded_at.desc()).all()
    logger.info(f"User {user.id} requested document list: {len(docs)} found")
    return {
        "documents": [
            {
                "id":          d.id,
                "filename":    d.filename,
                "chunks":      d.chunks,
                "uploaded_at": d.uploaded_at,
            }
            for d in docs
        ],
        "count": len(docs),
    }


@router.delete("/{filename}")
async def delete_doc(
    filename: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a document — deletes embeddings from ChromaDB and record from Postgres."""
    # Check ownership
    doc = db.query(Document).filter(
        Document.user_id == user.id,
        Document.filename == filename,
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail=f"'{filename}' not found.")
    logger.warning(f"User {user.id} requested to delete document: {filename}")
    # Delete embeddings from ChromaDB
    result = rag.delete_doc(filename, user.id)
    if not result["deleted"]:
        raise HTTPException(status_code=500, detail="Failed to delete embeddings.")

    # Delete record from Postgres
    db.delete(doc)
    db.commit()

    logger.info(f"User {user.id} deleted document: {filename}")
    return {"deleted": True, "filename": filename, "chunks_removed": result["chunks_removed"]}