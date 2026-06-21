from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    google_id:  Mapped[str]      = mapped_column(String, unique=True, index=True, nullable=False)
    email:      Mapped[str]      = mapped_column(String, unique=True, index=True, nullable=False)
    name:       Mapped[str]      = mapped_column(String, nullable=False)
    picture:    Mapped[str|None] = mapped_column(String, nullable=True)
    is_active:  Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    documents: Mapped[list["Document"]]   = relationship("Document", back_populates="user")
    chats:     Mapped[list["Chat"]]       = relationship("Chat", back_populates="user")

    def __repr__(self):
        return f"<User id={self.id} email={self.email}>"

class Document(Base):
    __tablename__ = "documents"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    user_id:     Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content_hash: Mapped[str] = mapped_column(String, index=True)
    filename:    Mapped[str]      = mapped_column(String, nullable=False)
    chunks:      Mapped[int]      = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="documents")

    def __repr__(self):
        return f"<Document id={self.id} filename={self.filename} user_id={self.user_id}>"

class Chat(Base):
    __tablename__ = "chats"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    user_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title:      Mapped[str]      = mapped_column(String, default="New Chat")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user:     Mapped["User"]              = relationship("User", back_populates="chats")
    messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="chat", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Chat id={self.id} title={self.title} user_id={self.user_id}>"

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    chat_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("chats.id"), nullable=False, index=True)
    user_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role:       Mapped[str]      = mapped_column(String, nullable=False)   # "user" | "assistant"
    content:    Mapped[str]      = mapped_column(Text, nullable=False)
    sources:    Mapped[str|None] = mapped_column(Text, nullable=True)      # JSON string
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    chat: Mapped["Chat"] = relationship("Chat", back_populates="messages")

    def __repr__(self):
        return f"<ChatMessage id={self.id} role={self.role} chat_id={self.chat_id}>"    