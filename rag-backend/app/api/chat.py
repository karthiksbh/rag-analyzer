import logging
from fastapi import APIRouter, HTTPException, Depends
from app.core import rag
from app.core.auth import get_current_user
from app.core.schema import ChatRequest, ChatResponse
from app.db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user: User = Depends(get_current_user),
):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    logger.info(f"User {user.id} asked: {request.question}")
    try:
        result = rag.ask(request.question, user.id)
    except Exception as e:
        logger.error(f"Error occurred while asking RAG: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"User {user.id} received answer: {result['answer']}")
    return ChatResponse(answer=result["answer"], sources=result["sources"])