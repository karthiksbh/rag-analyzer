from pydantic import BaseModel


class IngestResponse(BaseModel):
    message: str
    filename: str
    chunks: int


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]