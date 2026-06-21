# DocMind

A self-hosted, privacy-first RAG (Retrieval-Augmented Generation) document assistant. Upload your TDDs, service docs, or any PDF/TXT/MD files, and ask questions across all of them in one chat interface — answers are grounded only in what you uploaded, with sources cited.

Runs entirely on your own machine. Your documents and their embeddings stay local — nothing is sent anywhere except the actual text being embedded/queried via the Gemini API.

---

## Features

**Document Q&A**
- Upload PDF, TXT, or Markdown files
- Semantic search over your docs using Gemini embeddings + ChromaDB vector search
- Answers grounded only in your uploaded content — explicitly says "I couldn't find that" rather than hallucinating
- Source citations shown with every answer (which doc, which chunk, similarity distance)

**Chat sessions**
- ChatGPT-style sidebar — multiple independent chat sessions, each with its own history
- Auto-generated chat titles from your first question
- Rename and delete chats
- Multi-turn context — follow-up questions use recent conversation history

**Async processing**
- Document ingestion (extraction → chunking → embedding → storage) runs in the background via Celery, not blocking the upload request
- Real-time status polling — frontend shows a notification once embeddings are ready
- Upload multiple documents concurrently without waiting for earlier ones to finish

**Performance**
- Redis-backed response caching — identical questions (normalized) return instantly without re-querying the vector store or calling Gemini again
- Cache automatically invalidated when you upload or delete a document

**Multi-tenant ready**
- Google OAuth + JWT authentication
- Per-user document isolation — embeddings are scoped by user ID in ChromaDB, so multiple people can use the same deployment without seeing each other's docs
- **Local dev mode** — skip Google OAuth setup entirely and use a single local user (see below)

**Engineering**
- Structured logging across the ingestion and retrieval pipeline
- Global exception handling — no raw tracebacks leaked to the client
- Duplicate upload detection (same filename per user)
- 40+ pytest unit/integration tests covering the RAG pipeline, auth, and API routes

---

## Architecture

```
┌─────────────┐      ┌──────────────┐
│   React     │─────▶│   FastAPI    │
│  (Vite dev  │      │   Backend    │
│   server)   │      │              │
└─────────────┘      └──────┬───────┘
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
          ┌──────────┐ ┌──────────┐ ┌──────────────┐
          │ Postgres │ │  Redis   │ │   Celery     │
          │ (users,  │ │ (cache,  │ │   worker     │
          │  chats)  │ │  broker) │ │  (ingest)    │
          └──────────┘ └──────────┘ └──────┬───────┘
                                            │
                                  ┌─────────▼─────────┐
                                  │  ChromaDB (local   │
                                  │  persistent store, │
                                  │  shared volume)    │
                                  └────────────────────┘
```

- **Frontend** — React + Vite dev server (no build step — this is a local-use tool, so a production static build isn't necessary)
- **Backend** — FastAPI, modular routers (auth, ingest, chat, docs)
- **Worker** — Celery, handles document chunking + embedding in the background
- **Postgres** — users, chat sessions, chat messages, document metadata
- **Redis** — Celery broker + query response cache
- **ChromaDB** — runs in-process as a local persistent store (no separate server). The backend and worker containers share the same Docker volume, so both read/write the same vector data directly on disk.

---

## Quick start (Docker — recommended)

This runs all 5 containers (Postgres, Redis, backend, Celery worker, frontend) with one command.

### 1. Get a free Gemini API key
Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and create a key.

### 2. Clone and configure
```bash
git clone <your-repo-url>
cd docmind

cp rag-backend/.env.example rag-backend/.env
cp rag-frontend/.env.example rag-frontend/.env
```

Edit `rag-backend/.env` and set:
```
GOOGLE_API_KEY=your_actual_key_here
```

That's it for local use — `ENVIRONMENT=local` is already set by default, which skips Google OAuth entirely.

### 3. Run
```bash
docker compose up --build
```

First build takes a few minutes (pulling images, installing deps). Subsequent runs are fast.

### 4. Open the app
```
http://localhost:5173
```

You'll land straight in the chat interface — no login required in local mode. Upload a document from the sidebar, wait for the "embeddings ready" notification, then ask questions.

### Stopping
```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop and wipe all data (Postgres, Redis, ChromaDB vectors)
```

---

## Local dev mode vs. production mode

This app supports two auth modes, controlled by `ENVIRONMENT` in `rag-backend/.env`:

### `ENVIRONMENT=local` (default)
- No Google Cloud setup needed
- Backend auto-creates a single local user on first request
- Frontend skips the login screen entirely (`VITE_DEV_MODE=true` in `rag-frontend/.env`)
- Best for: trying the app, running it for yourself on your own machine

### `ENVIRONMENT=production`
- Real Google OAuth — supports multiple real users with isolated documents
- Requires Google Cloud OAuth credentials:
  1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
  2. Create an OAuth 2.0 Client ID (Web application)
  3. Add authorized redirect URI: `http://localhost:8000/auth/google/callback`
  4. Copy the Client ID and Secret into `rag-backend/.env`:
     ```
     GOOGLE_CLIENT_ID=...
     GOOGLE_CLIENT_SECRET=...
     ```
  5. Set `ENVIRONMENT=production` in `rag-backend/.env`
  6. Set `VITE_DEV_MODE=false` in `rag-frontend/.env`
- Best for: deploying for multiple people to use, or testing the real auth flow

---

## Running without Docker (manual setup)

If you'd rather run things directly:

**Prerequisites:** Python 3.11+, Node 20+, Postgres, Redis running locally.

```bash
# Backend
cd rag-backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit DATABASE_URL, REDIS_URL to point at your local services
uvicorn main:app --reload

# Celery worker (separate terminal)
celery -A app.core.tasks worker --loglevel=info

# Frontend (separate terminal)
cd rag-frontend
npm install
cp .env.example .env
npm run dev
```

ChromaDB needs no separate setup in either mode — it's a local file-based store created automatically at the path set by `CHROMA_PATH` (defaults to `chroma_store/` inside the backend folder).

---

## Project structure

```
docmind/
├── docker-compose.yml
├── rag-backend/
│   ├── Dockerfile
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── api/          # routers: auth, ingest, chat, docs
│   │   ├── core/         # RAGClassifier, auth, settings, middleware, exceptions, celery tasks
│   │   └── db/           # SQLAlchemy models and session
│   └── tests/            # pytest suite
└── rag-frontend/
    ├── Dockerfile
    ├── vite.config.js
    ├── .env.example
    └── src/
        ├── App.jsx
        └── api.js
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite |
| Backend | FastAPI, SQLAlchemy, Pydantic Settings |
| AI / Embeddings | Google Gemini (`gemini-embedding-2`, `gemini-2.5-flash`) |
| Vector store | ChromaDB (local persistent store, shared via Docker volume) |
| Relational DB | PostgreSQL |
| Cache / broker | Redis |
| Background jobs | Celery |
| Auth | Google OAuth 2.0, JWT |
| Testing | pytest |

---

## Notes

- Free-tier Gemini API has rate limits — if you're ingesting large documents or asking many questions quickly, you may hit them. The app degrades gracefully (returns an error message rather than crashing).
- Max upload size is 10MB by default — adjustable via `MAX_FILE_SIZE_MB` in `.env`.
- All your documents and embeddings live in Docker volumes on your machine. Running `docker compose down -v` deletes them permanently.
- The backend and Celery worker containers share a single Docker volume for ChromaDB data — both must point at the same `CHROMA_PATH` (handled automatically by `docker-compose.yml`).