import json
import logging
import hashlib
import fitz
import chromadb
from google import genai

from app.core.settings import settings
from app.db.session import redis_client

logger = logging.getLogger(__name__)


class RAGClassifier:
    def __init__(self):
        self.client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        self._collection = None

    @property
    def collection(self):
        if self._collection is None:
            logger.debug(f"Connecting to ChromaDB at: {settings.CHROMA_PATH}")
            db = chromadb.PersistentClient(path=settings.CHROMA_PATH)
            # using cosine similarity (pointing in same direction - retrieve documents who have less cosine similarity)
            # Cosine distance measures directional similarity between vectors - cosine_distance = 1 - cosine_similarity (less distance means more similar)
            self._collection = db.get_or_create_collection(
                name="docs",
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection

    def _cache_key(self, question: str, user_id: int) -> str:
        """Normalize question and build a cache key."""
        normalized = question.lower().strip().rstrip("?.,!")
        return f"chat:{user_id}:{hashlib.md5(normalized.encode()).hexdigest()}"

    def _cache_get(self, question: str, user_id: int) -> dict | None:
        key = self._cache_key(question, user_id)
        cached = redis_client.get(key)
        if cached:
            logger.info(f"[cache] Hit — user_id={user_id} question='{question[:60]}'")
            return json.loads(cached)
        return None

    def _cache_set(self, question: str, user_id: int, result: dict):
        key = self._cache_key(question, user_id)
        redis_client.setex(key, settings.CACHE_TTL, json.dumps(result))
        logger.debug(f"[cache] Stored — user_id={user_id} ttl={settings.CACHE_TTL}s")

    def _cache_invalidate_user(self, user_id: int):
        pattern = f"chat:{user_id}:*"

        deleted = 0
        for key in redis_client.scan_iter(pattern):
            redis_client.delete(key)
            deleted += 1

        logger.info(
            f"[cache] Invalidated {deleted} cached entries for user_id={user_id}"
        )

    def _extract_text(self, file_bytes: bytes, filename: str) -> str:
        ext = filename.rsplit(".", 1)[-1].lower()
        logger.debug(f"Extracting text from '{filename}' (ext: .{ext})")
        if ext == "pdf":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            text = "".join(page.get_text() for page in doc)
            doc.close()
            logger.debug(f"Extracted {len(text)} chars from PDF '{filename}'")
            return text
        elif ext in ("txt", "md"):
            text = file_bytes.decode("utf-8", errors="ignore")
            logger.debug(f"Extracted {len(text)} chars from '{filename}'")
            return text
        raise ValueError(f"Unsupported file type '.{ext}'.")

    def _chunk_text(self, text: str) -> list[str]:
        chunks, start = [], 0
        while start < len(text):
            chunks.append(text[start : start + int(settings.CHUNK_SIZE)].strip())
            start += int(settings.CHUNK_SIZE) - int(settings.CHUNK_OVERLAP)
        # chunk threshold to make sure that some smaller chunks which have no context or have poor embeddings are ignored.
        chunks = [c for c in chunks if len(c.strip()) >= settings.CHUNK_THRESHOLD]
        logger.debug(f"Split into {len(chunks)} chunks")
        return chunks

    def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        embeddings = []
        for text in texts:
            result = self.client.models.embed_content(
                model=settings.EMBED_MODEL,
                contents=text,
                # task_type is related to gemini to inform that this task is used for documents being stored
                config={"task_type": "RETRIEVAL_DOCUMENT"},
            )
            embeddings.append(result.embeddings[0].values)
        return embeddings

    def _embed_query(self, query: str) -> list[float]:
        # get the query embeddings of the query
        result = self.client.models.embed_content(
            model=settings.EMBED_MODEL,
            contents=query,
            # task type for gemini informing this is task for query retrieval
            config={"task_type": "RETRIEVAL_QUERY"},
        )
        return result.embeddings[0].values

    def ingest(self, file_bytes: bytes, filename: str, user_id: int) -> dict:
        logger.info(
            f"[ingest] Starting — file='{filename}' user_id={user_id} size={len(file_bytes)} bytes"
        )

        # Step 1: Extract the file into text content
        text = self._extract_text(file_bytes, filename)

        # Step 2: Chunk the texts for processing
        chunks = self._chunk_text(text)
        logger.info(f"[ingest] {len(chunks)} chunks for '{filename}'")

        # Step 3: Instead of sending all chunks at once to embedding model, we split into batches and send individual batch to embedding model
        # this is required so that the model is not overloaded, memory spikes dont happen etc.
        all_embeddings = []
        total_batches = (len(chunks) + 99) // 100 # way to calculate batches
        for i in range(0, len(chunks), 100):
            logger.debug(f"[ingest] Embedding batch {(i//100)+1}/{total_batches}")
            all_embeddings.extend(self._embed_texts(chunks[i : i + 100]))

        logger.info(f"[ingest] {len(all_embeddings)} vectors created for '{filename}'")

        # Step 4: Storing these embeddings and the content with the key like {user_id}:{file_name}:{chunk_id} with its metadata
        # We explicitly add metadata to each coz chroma db filtering from metadata is easier if we want to get documents of specific user than extracting from id
        '''
        Doesn't store like this but a sample for understanding
        {
            "1::resume.pdf::0": {
                "embedding": [...],
                "document": "abc is a Software Engineer...",
                "metadata": {
                    "user_id": "1",
                    "source": "resume.pdf",
                    "chunk_index": 0
                }
            },
            "1::resume.pdf::1": {
                "embedding": [...],
                "document": "Worked with Django...",
                "metadata": {
                    "user_id": "1",
                    "source": "resume.pdf",
                    "chunk_index": 1
                }
            }
        }   
        '''
        self.collection.upsert(
            ids=[f"{user_id}::{filename}::{i}" for i in range(len(chunks))],
            documents=chunks,
            embeddings=all_embeddings,
            metadatas=[
                {"source": filename, "user_id": str(user_id), "chunk_index": i}
                for i in range(len(chunks))
            ],
        )

        # Invalidate cache — remove all the cached answers of the user when new doc is uploaded
        self._cache_invalidate_user(user_id)
        logger.info(f"[ingest] Done — '{filename}' indexed for user_id={user_id}")
        return {"filename": filename, "chunks": len(chunks)}

    def retrieve(self, query: str, user_id: int) -> list[dict]:
        logger.info(
            f"[retrieve] query='{query[:80]}' user_id={user_id} top_k={settings.TOP_K}"
        )

        results = self.collection.query(
            query_embeddings=[self._embed_query(query)],
            # if the chunks are less than top k, it is handled by chroma db
            n_results=settings.TOP_K,
            where={"user_id": str(user_id)},
            include=["documents", "metadatas", "distances"],
        )

        documents = results.get("documents", [[]])[0]

        if not documents:
            logger.info(
                f"[retrieve] No chunks found for user_id={user_id}"
            )
            return []

        chunks = [
            {
                "text": doc,
                "source": meta["source"], # document name
                "chunk_index": meta["chunk_index"], # chunk which contains the info
                "distance": round(dist, 4), # distance between the embedding and question (here cosine distance - 0.10 distance means 0.9 similar)
            }
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

        logger.info(
            f"[retrieve] Found {len(chunks)} chunks from: "
            f"{list({c['source'] for c in chunks})}"
        )
        return chunks

    def ask(self, question: str, user_id: int, history: list[dict] = []) -> dict:
        """
        history: list of recent messages in chronological order
                 [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}, ...]
        """
        logger.info(
            f"[ask] question='{question[:80]}' user_id={user_id} history_len={len(history)}"
        )

        # Step 1: always check the cache first before quering from embeddings
        cached = self._cache_get(question, user_id)
        if cached:
            return cached

        # Step 2: if not present in cache, retrieve embeddings
        chunks = self.retrieve(question, user_id)
        if not chunks:
            logger.warning(f"[ask] No chunks found for user_id={user_id}")
            return {
                "answer": "No documents indexed yet.",
                "sources": [],
                "cached": False,
            }

        # build the context from the embeddings returned
        context = "\n\n".join(f"[{c['source']}]\n{c['text']}" for c in chunks)

        # build the conversation history and send to LLM
        history_text = ""
        if history:
            history_text = "Previous conversation:\n"
            for msg in history[-settings.CHAT_HISTORY_LIMIT :]:
                history_text += f"{msg['role'].upper()}: {msg['content']}\n"
            history_text += "\n"

        prompt = f"""You are a helpful assistant. Answer using ONLY the context below.
            If the answer is not in the context, say "I couldn't find that in the uploaded docs."

            {history_text}Context:
            {context}

            Question: {question}

            Answer:"""

        logger.debug(
            f"[ask] Calling '{settings.CHAT_MODEL}' with {len(chunks)} chunks, history={len(history)} msgs"
        )

        try:
            # call the LLM with the prompt
            response = self.client.models.generate_content(
                model=settings.CHAT_MODEL,
                contents=prompt,
            )
            result = {
                "answer": response.text,
                "sources": [
                    {"file": c["source"], "distance": c["distance"]} for c in chunks
                ],
                "cached": False,
            }
            logger.info(f"[ask] Answer generated for user_id={user_id}")

            # Cache every answer — same question in any chat gets instant response next time
            self._cache_set(question, user_id, result)

            return result

        except Exception as e:
            logger.error(
                f"[ask] Gemini error for user_id={user_id}: {e}", exc_info=True
            )
            return {
                "answer": "Sorry, I had trouble generating an answer. Please try again.",
                "sources": [],
                "cached": False,
            }

    def delete_doc(self, filename: str, user_id: int) -> dict:
        logger.info(f"[delete_doc] '{filename}' for user_id={user_id}")
        # Deleting all the embeddings of a user with filename (metadata filtering)
        results = self.collection.get(
            where={
                "$and": [
                    {"user_id": {"$eq": str(user_id)}},
                    {"source": {"$eq": filename}},
                ]
            },
            include=["metadatas"],
        )
        if not results["ids"]:
            logger.warning(f"[delete_doc] '{filename}' not found for user_id={user_id}")
            return {"deleted": False, "filename": filename}

        self.collection.delete(ids=results["ids"])

        # delete all the answers from cache for the given user
        self._cache_invalidate_user(user_id)

        logger.info(
            f"[delete_doc] Deleted {len(results['ids'])} chunks for '{filename}'"
        )
        return {
            "deleted": True,
            "filename": filename,
            "chunks_removed": len(results["ids"]),
        }
