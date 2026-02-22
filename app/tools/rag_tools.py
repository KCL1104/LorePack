# RAG retrieval tools
# Provides semantic vector search based on lorebook entries
# Uses text-embedding-004 for embeddings, stored in Firestore

import json
import math

from app.tools.user_context import resolve_owner_uid

_EMBED_MODEL = "text-embedding-004"
_cached_genai_client = None
_cached_lorebooks_col = None
_embedding_cache: dict[str, list[float]] = {}


def _get_lorebooks_col():
    """Lazy singleton for Firestore collection."""
    global _cached_lorebooks_col
    if _cached_lorebooks_col is None:
        from google.cloud import firestore

        _cached_lorebooks_col = firestore.Client().collection("lorebooks")
    return _cached_lorebooks_col


def _get_genai_client():
    """Lazy singleton for genai client."""
    global _cached_genai_client
    if _cached_genai_client is None:
        from google import genai
        from google.cloud import firestore

        db = firestore.Client()
        _cached_genai_client = genai.Client(
            vertexai=True, project=db.project, location="global"
        )
    return _cached_genai_client


def _compute_embedding(text: str) -> list[float]:
    """Compute embedding vector for a text string."""
    cached = _embedding_cache.get(text)
    if cached is not None:
        return cached

    result = _get_genai_client().models.embed_content(model=_EMBED_MODEL, contents=text)
    embedding = list(result.embeddings[0].values)
    _embedding_cache[text] = embedding
    return embedding


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def embed_and_store_entry(lorebook_id: str, entry_id: str, owner_uid: str = "") -> None:
    """Compute and store embedding for a lorebook entry.

    Called automatically when entries are created or updated.

    Args:
        lorebook_id: Lorebook ID.
        entry_id: Entry ID within the lorebook.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    _lorebooks_col = _get_lorebooks_col()
    lb_ref = _lorebooks_col.document(lorebook_id)
    lb_snap = lb_ref.get()
    if not lb_snap.exists:
        return

    if lb_snap.to_dict().get("owner_uid") != resolved_owner_uid:
        return

    entry_ref = (
        _lorebooks_col.document(lorebook_id).collection("entries").document(entry_id)
    )
    entry_snap = entry_ref.get()
    if not entry_snap.exists:
        return

    entry = entry_snap.to_dict()
    if entry.get("owner_uid") != resolved_owner_uid:
        return

    tags = entry.get("tags", [])
    text = f"{entry['name']}. Category: {entry['category']}. {entry['content']}. Tags: {', '.join(tags)}"
    embedding = _compute_embedding(text)
    entry_ref.update({"embedding": embedding})


def search_lore(
    query: str,
    lorebook_id: str = "",
    top_k: int = 5,
    owner_uid: str = "",
) -> str:
    """Perform a semantic search across lorebooks for the most relevant entries.

    This tool is the core of RAG (Retrieval-Augmented Generation), used to
    retrieve relevant world-building settings before generating story content
    to ensure consistency.

    Uses vector similarity (text-embedding-004) when embeddings are available,
    falls back to keyword matching otherwise.

    Args:
        query: Search query string, e.g. "protagonist's magical abilities" or "kingdom's political situation".
        lorebook_id: Lorebook ID to restrict the search scope. Leave empty to search all lorebooks.
        top_k: Maximum number of results to return. Defaults to 5.

    Returns:
        JSON string containing a list of the most relevant lorebook entries.
    """
    resolved_owner_uid = resolve_owner_uid(owner_uid)
    _lorebooks_col = _get_lorebooks_col()
    query_embedding = _compute_embedding(query)
    results = []

    # Determine search scope
    if lorebook_id:
        lb_snap = _lorebooks_col.document(lorebook_id).get()
        if not lb_snap.exists:
            return json.dumps([], ensure_ascii=False, indent=2)

        lorebook_data = lb_snap.to_dict()
        if lorebook_data.get("owner_uid") != resolved_owner_uid:
            return json.dumps([], ensure_ascii=False, indent=2)
        scope = [(lorebook_id, lorebook_data)]
    else:
        scope = [
            (s.id, s.to_dict())
            for s in _lorebooks_col.stream()
            if s.to_dict().get("owner_uid") == resolved_owner_uid
        ]

    for lb_id, lorebook in scope:
        entries_ref = _lorebooks_col.document(lb_id).collection("entries")
        for entry_snap in entries_ref.stream():
            entry = entry_snap.to_dict()
            if entry.get("owner_uid") != resolved_owner_uid:
                continue

            entry_embedding = entry.get("embedding")

            if entry_embedding:
                score = _cosine_similarity(query_embedding, entry_embedding)
            else:
                # Fallback: keyword matching for entries without embeddings
                query_lower = query.lower()
                tags = entry.get("tags", [])
                searchable = (
                    f"{entry['name']} {entry['content']} {' '.join(tags)}".lower()
                )
                score = sum(1.0 for word in query_lower.split() if word in searchable)
                score = score / max(
                    len(query_lower.split()), 1
                )  # Normalize to 0-1 range

            if score > 0.3:
                results.append(
                    {
                        "lorebook_id": lb_id,
                        "lorebook_title": lorebook.get("title", ""),
                        "entry_id": entry["id"],
                        "category": entry["category"],
                        "name": entry["name"],
                        "content": entry["content"],
                        "relevance_score": round(score, 4),
                    }
                )

    results.sort(key=lambda x: x["relevance_score"], reverse=True)
    return json.dumps(results[:top_k], ensure_ascii=False, indent=2)
