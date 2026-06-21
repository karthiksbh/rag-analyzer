import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.core import rag
from app.core.settings import settings
from app.core.auth import get_current_user
from app.core.schema import NewChatRequest, AskRequest, RenameChatRequest
from app.db.session import get_db
from app.db.models import Chat, ChatMessage, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("/new")
async def new_chat(
    request: NewChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new chat session."""
    chat = Chat(user_id=user.id, title=request.title)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    logger.info(f"[chat] New chat created — chat_id={chat.id} user_id={user.id}")
    return {"id": chat.id, "title": chat.title, "created_at": chat.created_at}


@router.get("")
async def list_chats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all chats for the current user, most recent first."""
    chats = (
        db.query(Chat)
        .filter(Chat.user_id == user.id)
        .order_by(Chat.updated_at.desc())
        .all()
    )

    result = []
    for chat in chats:
        # get last message for preview
        last_msg = (
            db.query(ChatMessage)
            .filter(ChatMessage.chat_id == chat.id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        result.append({
            "id":           chat.id,
            "title":        chat.title,
            "created_at":   chat.created_at,
            "updated_at":   chat.updated_at,
            "last_message": last_msg.content[:80] if last_msg else None,
        })

    return {"chats": result, "count": len(result)}


@router.get("/{chat_id}")
async def get_chat(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full message history for a chat."""
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_id == chat_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return {
        "id":       chat.id,
        "title":    chat.title,
        "messages": [
            {
                "id":         m.id,
                "role":       m.role,
                "content":    m.content,
                "sources":    json.loads(m.sources) if m.sources else [],
                "created_at": m.created_at,
            }
            for m in messages
        ],
    }


@router.post("/{chat_id}/ask")
async def ask(
    chat_id: int,
    request: AskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ask a question in a specific chat. Sends chat history as context."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # Verify chat belongs to user
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")

    # Fetch recent history for context
    recent_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_id == chat_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(settings.CHAT_HISTORY_LIMIT)
        .all()
    )
    # reverse to chronological order for the prompt
    history = [
        {"role": m.role, "content": m.content}
        for m in reversed(recent_messages)
    ]

    logger.info(f"[chat] User {user.id} asked in chat {chat_id}: '{request.question[:80]}'")

    result = rag.ask(request.question, user.id, history=history)

    # Save user message
    db.add(ChatMessage(
        chat_id=chat_id,
        user_id=user.id,
        role="user",
        content=request.question,
    ))

    # Save assistant message
    db.add(ChatMessage(
        chat_id=chat_id,
        user_id=user.id,
        role="assistant",
        content=result["answer"],
        sources=json.dumps(result["sources"]),
    ))

    # Auto-generate title from first question
    if chat.title == "New Chat" and not recent_messages:
        try:
            short = request.question[:60]
            title_response = rag.client.models.generate_content(
                model=rag.chat_model if hasattr(rag, 'chat_model') else "gemini-2.5-flash",
                contents=f"Summarize this question in 5 words or less, no punctuation: {short}",
            )
            chat.title = title_response.text.strip()[:60]
            logger.info(f"[chat] Auto-titled chat {chat_id}: '{chat.title}'")
        except Exception:
            chat.title = request.question[:40]

    # Update chat updated_at
    chat.updated_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(f"[chat] Answer delivered — chat_id={chat_id} cached={result.get('cached', False)}")

    return {
        "answer":  result["answer"],
        "sources": result["sources"],
        "cached":  result.get("cached", False),
        "chat_id": chat_id,
    }


@router.patch("/{chat_id}")
async def rename_chat(
    chat_id: int,
    request: RenameChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename a chat."""
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    chat.title = request.title
    db.commit()
    return {"id": chat.id, "title": chat.title}


@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a chat and all its messages."""
    chat = db.query(Chat).filter(Chat.id == chat_id, Chat.user_id == user.id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    db.delete(chat)
    db.commit()
    logger.info(f"[chat] Deleted chat_id={chat_id} user_id={user.id}")
    return {"deleted": True, "chat_id": chat_id}