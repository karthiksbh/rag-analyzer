import logging
import fitz
import chromadb
from google import genai

from app.core.settings import settings

logger = logging.getLogger(__name__)


class RAGClassifier:

    def __init__(self):
        self.client      = genai.Client(api_key=settings.GOOGLE_API_KEY)
        self._collection = None

    @property
    def collection(self):
        if self._collection is None:
            db = chromadb.HttpClient(
                host=settings.CHROMA_HOST,
                port=settings.CHROMA_PORT,
            )
            self._collection = db.get_or_create_collection(
                name="docs",
                metadata={"hnsw:space": "cosine"},
            )
        return self._collection

    def _extract_text(self, file_bytes: bytes, filename: str) -> str:
        ext = filename.rsplit(".", 1)[-1].lower()
        logger.debug(f"Extracting text from '{filename}' (ext: .{ext})")
        if ext == "pdf":
            doc  = fitz.open(stream=file_bytes, filetype="pdf")
            text = "".join(page.get_text() for page in doc)
            doc.close()
            logger.debug(f"Extracted {len(text)} characters from PDF '{filename}'")
            return text
        elif ext in ("txt", "md"):
            text = file_bytes.decode("utf-8", errors="ignore")
            logger.debug(f"Extracted {len(text)} characters from '{filename}'")
            return text
        raise ValueError(f"Unsupported file type '.{ext}'.")

    def _chunk_text(self, text: str) -> list[str]:
        chunks, start = [], 0
        while start < len(text):
            chunks.append(text[start : start + int(settings.CHUNK_SIZE)].strip())
            start += int(settings.CHUNK_SIZE) - int(settings.CHUNK_OVERLAP)
        chunks = [c for c in chunks if len(c) > 50]
        logger.debug(f"Text split into {len(chunks)} chunks (size={settings.CHUNK_SIZE}, overlap={settings.CHUNK_OVERLAP})")
        return chunks

    def _embed_texts(self, texts: list[str]) -> list[list[float]]:
        logger.debug(f"Embedding {len(texts)} chunks with model '{settings.EMBED_MODEL}'")
        embeddings = []
        for text in texts:
            result = self.client.models.embed_content(
                model=settings.EMBED_MODEL,
                contents=text,
                config={"task_type": "RETRIEVAL_DOCUMENT"},
            )
            embeddings.append(result.embeddings[0].values)
        logger.debug(f"Generated {len(embeddings)} embeddings")
        return embeddings

    def _embed_query(self, query: str) -> list[float]:
        logger.debug(f"Embedding query: '{query[:80]}{'...' if len(query) > 80 else ''}'")
        result = self.client.models.embed_content(
            model=settings.EMBED_MODEL,
            contents=query,
            config={"task_type": "RETRIEVAL_QUERY"},
        )
        return result.embeddings[0].values

    def ingest(self, file_bytes: bytes, filename: str, user_id: int) -> dict:
        logger.info(f"[ingest] Starting — file='{filename}' user_id={user_id} size={len(file_bytes)} bytes")

        text   = self._extract_text(file_bytes, filename)
        chunks = self._chunk_text(text)
        logger.info(f"[ingest] Chunking done — {len(chunks)} chunks for '{filename}'")

        all_embeddings = []
        total_batches  = (len(chunks) + 99) // 100
        for i in range(0, len(chunks), 100):
            batch_num = (i // 100) + 1
            logger.debug(f"[ingest] Embedding batch {batch_num}/{total_batches}")
            all_embeddings.extend(self._embed_texts(chunks[i : i + 100]))

        logger.info(f"[ingest] Embedding done — {len(all_embeddings)} vectors for '{filename}'")

        self.collection.upsert(
            ids        = [f"{user_id}::{filename}::{i}" for i in range(len(chunks))],
            documents  = chunks,
            embeddings = all_embeddings,
            metadatas  = [{"source": filename, "user_id": str(user_id), "chunk_index": i} for i in range(len(chunks))],
        )
        logger.info(f"[ingest] Upsert complete — '{filename}' indexed for user_id={user_id}")
        return {"filename": filename, "chunks": len(chunks)}

    def retrieve(self, query: str, user_id: int) -> list[dict]:
        logger.info(f"[retrieve] query='{query[:80]}{'...' if len(query) > 80 else ''}' user_id={user_id} top_k={settings.TOP_K}")

        results = self.collection.query(
            query_embeddings=[self._embed_query(query)],
            n_results=settings.TOP_K,
            where={"user_id": str(user_id)},
            include=["documents", "metadatas", "distances"],
        )

        chunks = [
            {
                "text":        doc,
                "source":      meta["source"],
                "chunk_index": meta["chunk_index"],
                "distance":    round(dist, 4),
            }
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

        sources = list({c["source"] for c in chunks})
        logger.info(f"[retrieve] Found {len(chunks)} chunks from sources: {sources}")
        return chunks

    def ask(self, question: str, user_id: int) -> dict:
        logger.info(f"[ask] question='{question[:80]}{'...' if len(question) > 80 else ''}' user_id={user_id}")

        chunks = self.retrieve(question, user_id)
        if not chunks:
            logger.warning(f"[ask] No chunks found for user_id={user_id} — no docs indexed")
            return {"answer": "No documents indexed yet.", "sources": []}

        context = "\n\n".join(f"[{c['source']}]\n{c['text']}" for c in chunks)
        prompt  = f"""You are a helpful assistant. Answer using ONLY the context below.
            If the answer is not in the context, say "I couldn't find that in the uploaded docs."

            Context:
            {context}

            Question: {question}

            Answer:"""

        logger.debug(f"[ask] Sending prompt to model '{settings.CHAT_MODEL}' with {len(chunks)} context chunks")

        try:
            response = self.client.models.generate_content(
                model=settings.CHAT_MODEL,
                contents=prompt,
            )
            logger.info(f"[ask] Answer generated successfully for user_id={user_id}")
            return {
                "answer":  response.text,
                "sources": [{"file": c["source"], "distance": c["distance"]} for c in chunks],
            }
        except Exception as e:
            logger.error(f"[ask] Gemini API error for user_id={user_id}: {e}", exc_info=True)
            return {"answer": "Sorry, I had trouble generating an answer. Please try again.", "sources": []}

    def list_docs(self, user_id: int) -> list[str]:
        logger.debug(f"[list_docs] Fetching docs for user_id={user_id}")
        data  = self.collection.get(where={"user_id": str(user_id)}, include=["metadatas"])
        docs  = sorted({m["source"] for m in data["metadatas"]})
        logger.info(f"[list_docs] user_id={user_id} has {len(docs)} doc(s): {docs}")
        return docs

    def delete_doc(self, filename: str, user_id: int) -> dict:
        logger.info(f"[delete_doc] Deleting '{filename}' for user_id={user_id}")
        results = self.collection.get(
            where={"$and": [{"user_id": {"$eq": str(user_id)}}, {"source": {"$eq": filename}}]},
            include=["metadatas"],
        )
        if not results["ids"]:
            logger.warning(f"[delete_doc] '{filename}' not found for user_id={user_id}")
            return {"deleted": False, "filename": filename}

        self.collection.delete(ids=results["ids"])
        logger.info(f"[delete_doc] Deleted {len(results['ids'])} chunks for '{filename}' user_id={user_id}")
        return {"deleted": True, "filename": filename, "chunks_removed": len(results["ids"])}