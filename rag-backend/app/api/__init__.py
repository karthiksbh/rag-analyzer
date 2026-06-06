
from fastapi import APIRouter
from app.api import ingest, chat, docs, auth

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(ingest.router)
api_router.include_router(chat.router)
api_router.include_router(docs.router)